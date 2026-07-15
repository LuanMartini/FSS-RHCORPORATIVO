import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { getEnv } from '../../config/env.js';
import { all } from '../../db/client.js';
import * as service from '../application/atsService.js';
import * as repository from '../infrastructure/atsRepository.js';

type Ack = (response: Record<string, unknown>) => void;
type SocketUser = { id: number; name: string; email: string; color: string };
type CandidateAccess = { applicationId: number; candidateId: number; portalToken: string };

let io: Server | null = null;
let redisReady = !process.env.REDIS_URL;
let redisError: string | null = null;
const COLORS = ['#0d9488','#2563eb','#7c3aed','#db2777','#ea580c','#0891b2'];

function errorResponse(error: unknown): Record<string, unknown> {
  const row = error as { message?: string; code?: string; status?: number };
  const status=row.status ?? 500;
  return { ok:false,error:status>=500?'Erro de comunicacao.':row.message ?? 'Operacao nao permitida.',...(status<500&&row.code?{code:row.code}:{}),status };
}

function recruiter(socket: Socket): SocketUser {
  const user = socket.data.user as SocketUser | undefined;
  if (!user) throw Object.assign(new Error('Evento restrito a recrutadores.'),{ status:403,code:'ATS_RECRUITER_ONLY' });
  return user;
}

function broadcastPresence(vacancyId: number): void {
  if (!io) return;
  void io.in(`vaga:${vacancyId}`).fetchSockets().then((sockets) => {
    const values=sockets.map((item)=>item.data.user as SocketUser|undefined).filter((item):item is SocketUser=>Boolean(item));
    const unique=[...new Map(values.map((user)=>[user.id,user])).values()];
    io?.to(`vaga:${vacancyId}`).emit('presence:update',unique);
  }).catch(()=>undefined);
}

function leaveVacancy(socket: Socket): void {
  const vacancyId = Number(socket.data.vacancyId ?? 0);
  if (!vacancyId) return;
  void socket.leave(`vaga:${vacancyId}`);
  broadcastPresence(vacancyId);
  socket.data.vacancyId = undefined;
}

export function attachAtsSocketServer(server: HttpServer): Server {
  if (io) return io;
  const env = getEnv();
  io = new Server(server,{
    cors:{ origin:env.corsOrigins,credentials:true },
    connectionStateRecovery:{ maxDisconnectionDuration:2*60*1000,skipMiddlewares:false },
    maxHttpBufferSize:100_000,
    pingTimeout:20_000,
  });
  if (process.env.REDIS_URL) {
    const publisher=createClient({url:process.env.REDIS_URL});
    const subscriber=publisher.duplicate();
    publisher.on('error',(error)=>console.error('Redis ATS publisher',error.message));
    subscriber.on('error',(error)=>console.error('Redis ATS subscriber',error.message));
    redisReady=false;
    void Promise.all([publisher.connect(),subscriber.connect()])
      .then(()=>{io?.adapter(createAdapter(publisher,subscriber));redisReady=true;redisError=null;})
      .catch((error)=>{redisError=error instanceof Error?error.message:String(error);console.error('Falha no Redis adapter ATS:',redisError);});
  }

  io.use(async (socket,next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      const portalToken = String(socket.handshake.auth?.portalToken ?? '');
      if (token) {
        const payload = jwt.verify(token,env.jwtSecret,{
          algorithms:['HS256'],issuer:env.jwtIssuer,audience:env.jwtAudience,
        }) as { sub?: string | number; email?: string; sv?: number };
        const userId = Number(payload.sub);
        const rows = await all(`SELECT u.id,u.nome,u.email,u.session_version FROM usuarios u
          JOIN perfis_permissoes pp ON pp.perfil=u.perfil AND pp.permissao='ats.use'
          WHERE u.id=? AND u.ativo`,[userId]) as Array<Record<string,unknown>>;
        if (!rows[0]||Number(rows[0].session_version)!==Number(payload.sv??1)) throw new Error('Usuario nao encontrado ou sessao revogada.');
        socket.data.user = { id:userId,name:String(rows[0].nome),email:String(rows[0].email),color:COLORS[userId%COLORS.length] ?? '#0d9488' } satisfies SocketUser;
        socket.data.sessionVersion = Number(rows[0].session_version);
      } else if (portalToken) {
        const access = await service.portal(portalToken);
        const row = access.access as Record<string,unknown>;
        socket.data.candidate = { applicationId:Number(row.candidatura_id),candidateId:Number(row.candidato_id),portalToken } satisfies CandidateAccess;
      } else throw new Error('Credencial ausente.');
      next();
    } catch { next(new Error('Nao autorizado.')); }
  });

  io.on('connection',(socket) => {
    const candidate = socket.data.candidate as CandidateAccess | undefined;
    socket.use(async (_packet,next) => {
      if (candidate) return next();
      try {
        const user=socket.data.user as SocketUser|undefined;
        if(!user)throw new Error('Sessao ausente.');
        const rows=await all(`SELECT u.session_version FROM usuarios u
          JOIN perfis_permissoes pp ON pp.perfil=u.perfil AND pp.permissao='ats.use'
          WHERE u.id=? AND u.ativo`,[user.id]) as Array<Record<string,unknown>>;
        if(!rows[0]||Number(rows[0].session_version)!==Number(socket.data.sessionVersion))throw new Error('Sessao revogada.');
        next();
      }catch{next(new Error('Nao autorizado.'));}
    });
    if (candidate) {
      socket.join(`chat:${candidate.applicationId}`);
      socket.on('chat:send',async (payload:Record<string,unknown>,ack?:Ack) => {
        try {
          const message = await service.sendCandidateMessage(candidate.portalToken,payload.mensagem,payload.idempotencia);
          io?.to(`chat:${candidate.applicationId}`).emit('chat:message',message);
          ack?.({ ok:true,message });
        } catch (error) { ack?.(errorResponse(error)); }
      });
      return;
    }

    socket.on('vaga:join',async (payload:Record<string,unknown>,ack?:Ack) => {
      try {
        const user = recruiter(socket);
        const vacancyId = Number(payload.vagaId);
        await repository.assertVacancyPermission(user.id,vacancyId);
        leaveVacancy(socket);
        await socket.join(`vaga:${vacancyId}`);
        socket.data.vacancyId = vacancyId;
        broadcastPresence(vacancyId);
        ack?.({ ok:true,recovered:socket.recovered });
      } catch (error) { ack?.(errorResponse(error)); }
    });

    socket.on('cursor:move',(payload:Record<string,unknown>) => {
      const vacancyId = Number(socket.data.vacancyId ?? 0);
      const user = socket.data.user as SocketUser | undefined;
      const x = Number(payload.x); const y = Number(payload.y);
      if (!vacancyId || !user || !Number.isFinite(x) || !Number.isFinite(y) || x<0 || x>1 || y<0 || y>1) return;
      socket.to(`vaga:${vacancyId}`).volatile.emit('cursor:update',{ userId:user.id,name:user.name,color:user.color,x,y,at:Date.now() });
    });

    socket.on('card:lock',async (payload:Record<string,unknown>,ack?:Ack) => {
      try {
        const user = recruiter(socket);
        const card = await service.lockCard(payload.vagaId,payload.candidaturaId,payload.versao,user.id);
        io?.to(`vaga:${payload.vagaId}`).emit('card:locked',{ candidaturaId:payload.candidaturaId,user,expiresAt:card.bloqueado_ate });
        ack?.({ ok:true,card });
      } catch (error) { ack?.(errorResponse(error)); }
    });

    socket.on('card:unlock',async (payload:Record<string,unknown>) => {
      try {
        const user = recruiter(socket);
        await service.unlockCard(payload.candidaturaId,user.id);
        io?.to(`vaga:${payload.vagaId}`).emit('card:unlocked',{ candidaturaId:payload.candidaturaId });
      } catch { /* lock expira automaticamente */ }
    });

    socket.on('card:move',async (payload:Record<string,unknown>,ack?:Ack) => {
      try {
        const user = recruiter(socket);
        const correlationId = payload.correlationId ? String(payload.correlationId) : undefined;
        const card = await service.moveCard({
          candidaturaId:Number(payload.candidaturaId),vagaId:Number(payload.vagaId),targetStage:payload.etapa,
          targetPosition:Number(payload.posicao ?? 0),expectedVersion:Number(payload.versao),userId:user.id,
          ...(correlationId ? { correlationId } : {}),
        });
        const event = { candidaturaId:Number(payload.candidaturaId),vagaId:Number(payload.vagaId),etapa:card.etapa,posicao:card.posicao,versao:card.versao,movidoPor:user };
        io?.to(`vaga:${payload.vagaId}`).emit('card:moved',event);
        ack?.({ ok:true,card:event });
      } catch (error) { ack?.(errorResponse(error)); }
    });

    socket.on('chat:join',async (payload:Record<string,unknown>,ack?:Ack) => {
      try {
        const user = recruiter(socket);
        const applicationId = Number(payload.candidaturaId);
        await service.messages(applicationId,user.id);
        await socket.join(`chat:${applicationId}`);
        ack?.({ ok:true });
      } catch (error) { ack?.(errorResponse(error)); }
    });

    socket.on('chat:send',async (payload:Record<string,unknown>,ack?:Ack) => {
      try {
        const user = recruiter(socket);
        const applicationId = Number(payload.candidaturaId);
        const message = await service.sendRecruiterMessage(applicationId,user.id,payload.mensagem,payload.idempotencia);
        io?.to(`chat:${applicationId}`).emit('chat:message',message);
        ack?.({ ok:true,message });
      } catch (error) { ack?.(errorResponse(error)); }
    });

    socket.on('disconnect',() => {
      leaveVacancy(socket);
      // Locks nao sao liberados por disconnect: outra aba do mesmo usuario pode
      // continuar o movimento. O TTL de 15s recupera locks abandonados.
    });
  });
  return io;
}

export function atsInfrastructureStatus(): { ready: boolean; error: string | null } {
  const env=getEnv();
  if (!env.requireRedis) return {ready:true,error:redisError};
  return {ready:redisReady,error:redisError};
}

export function publishChatMessage(applicationId:number,message:unknown):void { io?.to(`chat:${applicationId}`).emit('chat:message',message); }
export function publishInterview(vacancyId:number,interview:unknown):void { io?.to(`vaga:${vacancyId}`).emit('interview:scheduled',interview); }
