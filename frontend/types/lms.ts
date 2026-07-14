export interface LmsCollaborator{id:number;nome:string;departamento_id:number}
export interface LmsTrail{id:number;nome:string;descricao:string;xp_conclusao:number}
export interface LmsCourse{id:number;titulo:string;descricao:string;carga_minutos:number;nota_minima:number;percentual_video_minimo:number;xp_conclusao:number;ordem:number;curso_pre_requisito_id:number|null;matricula_id:number;status:string;progresso_percentual:number;nota_final:number|null;versao:number;desbloqueado:boolean}
export interface LmsLesson{id:number;curso_id:number;titulo:string;descricao:string;ordem:number;tipo:string;video_url:string;duracao_segundos:number;ultimo_segundo:number;maximo_segundo_assistido:number;tempo_valido_segundos:number;percentual:number;concluida:boolean;versao:number}
export interface LmsBadge{id:number;codigo:string;nome:string;descricao:string;cor_primaria:string;icone:string;xp_bonus:number;conquistado_em:string}
export interface LeaderboardEntry{colaborador_id:number;nome:string;equipe:string;xp:number;posicao:number}
export interface LmsDashboard{collaborators:LmsCollaborator[];trails:LmsTrail[];selectedCollaboratorId:number;selectedTrailId:number;courses:LmsCourse[];lessons:LmsLesson[];badges:LmsBadge[];leaderboard:LeaderboardEntry[];xp:number;period:'SEMANAL'|'MENSAL'}
export interface QuizAttempt{id:string;questoes_snapshot:{id:number;enunciado:string;alternativas:{id:number;texto:string}[]}[];numero_tentativa:number;expira_em:string}
