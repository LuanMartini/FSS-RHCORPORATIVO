import { useEffect, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, TileLayer, useMap } from 'react-leaflet';
import { apiFetch } from '../../services/api';
import type { JornadaConfig, RegistroPontoResposta, TipoMarcacao } from '../../types/jornada';

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface Props {
  collaboratorId: number;
  config: JornadaConfig;
  onClose: () => void;
  onRegistered: (receipt: RegistroPontoResposta) => void;
  onBiometricEnrolled: () => void;
}

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.flyTo(position, 17, { duration: 0.7 }); }, [map, position]);
  return null;
}

function LocationMap({ position, config }: { position: Position; config: JornadaConfig }) {
  const userPosition: [number, number] = [position.latitude, position.longitude];
  const branchPosition: [number, number] = [config.branch.latitude, config.branch.longitude];
  const polygon = config.branch.polygon?.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
  return (
    <MapContainer center={userPosition} zoom={17} className="h-full min-h-52 w-full" zoomControl={false} attributionControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      <Recenter position={userPosition} />
      {config.branch.geofenceType === 'RAIO' && config.branch.radiusMeters && (
        <Circle center={branchPosition} radius={config.branch.radiusMeters} pathOptions={{ color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 0.12 }} />
      )}
      {polygon && <Polygon positions={polygon} pathOptions={{ color: '#0284c7', fillOpacity: 0.12 }} />}
      <CircleMarker center={branchPosition} radius={7} pathOptions={{ color: '#0f172a', fillColor: '#0f172a', fillOpacity: 1 }} />
      <CircleMarker center={userPosition} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#10b981', fillOpacity: 1 }} />
      <Circle center={userPosition} radius={position.accuracy} pathOptions={{ stroke: false, fillColor: '#10b981', fillOpacity: 0.08 }} />
    </MapContainer>
  );
}

const punchOptions: Array<{ type: TipoMarcacao; label: string; short: string }> = [
  { type: 'ENTRADA', label: 'Entrada', short: 'IN' },
  { type: 'INTERVALO_INICIO', label: 'Início intervalo', short: 'II' },
  { type: 'INTERVALO_FIM', label: 'Fim intervalo', short: 'FI' },
  { type: 'SAIDA', label: 'Saída', short: 'OUT' },
];

export default function ClockModal({ collaboratorId, config, onClose, onRegistered, onBiometricEnrolled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [type, setType] = useState<TipoMarcacao>('ENTRADA');
  const [cameraReady, setCameraReady] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const pointAttemptId = useRef(crypto.randomUUID());
  const pointRequestLocked = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let watchId: number | null = null;
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
      .then((mediaStream) => {
        stream = mediaStream;
        if (videoRef.current) { videoRef.current.srcObject = mediaStream; void videoRef.current.play(); }
      })
      .catch(() => setCameraError('Não foi possível acessar a câmera. Verifique a permissão do navegador.'));
    if (!navigator.geolocation) setLocationError('Geolocalização não suportada neste navegador.');
    else watchId = navigator.geolocation.watchPosition(
      (result) => setPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy }),
      (error) => setLocationError(error.code === 1 ? 'Permissão de localização negada.' : 'Não foi possível obter o GPS.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 2_000 },
    );
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  function capture(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) { setActionError('Aguarde a inicialização da câmera.'); return null; }
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 640;
    canvas.height = 640;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 640, 640);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setPhoto(dataUrl);
    setActionError('');
    return dataUrl;
  }

  async function enroll() {
    const image = photo ?? capture();
    if (!image) return;
    setEnrolling(true);
    setActionError('');
    try {
      await apiFetch('/jornada/biometria/cadastrar', {
        method: 'POST', body: JSON.stringify({ colaboradorId: collaboratorId, fotoBase64: image, consentimento: true }),
      });
      onBiometricEnrolled();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Falha ao cadastrar biometria.'); }
    finally { setEnrolling(false); }
  }

  async function register() {
    if (pointRequestLocked.current) return;
    if (!position) { setActionError('Aguarde uma posição GPS válida.'); return; }
    const image = photo ?? capture();
    if (!image) return;
    pointRequestLocked.current = true;
    setSubmitting(true);
    setActionError('');
    try {
      const receipt = await apiFetch<RegistroPontoResposta>('/jornada/pontos', {
        method: 'POST',
        body: JSON.stringify({
          colaboradorId: collaboratorId, tipo: type, latitude: position.latitude,
          longitude: position.longitude, precisaoMetros: position.accuracy,
          fotoBase64: image, capturadoEm: new Date().toISOString(),
          idempotencyKey: pointAttemptId.current, coletorId: `WEB-${navigator.platform || 'BROWSER'}`,
        }),
      });
      pointAttemptId.current = crypto.randomUUID();
      onRegistered(receipt);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Falha ao registrar ponto.'); }
    finally { pointRequestLocked.current = false; setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[96vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Marcação segura</p><h2 className="text-lg font-semibold text-slate-950">{config.collaborator.name}</h2></div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200">Fechar</button>
        </header>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <section>
            <div className="relative aspect-square overflow-hidden rounded-3xl bg-slate-950">
              <video ref={videoRef} muted playsInline onCanPlay={() => setCameraReady(true)} className={`h-full w-full scale-x-[-1] object-cover ${photo ? 'opacity-0' : ''}`} />
              {photo && <img src={photo} alt="Captura facial" className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" />}
              <div className="pointer-events-none absolute inset-8 rounded-[42%] border-2 border-white/70 shadow-[0_0_0_999px_rgba(15,23,42,0.3)]" />
              <span className="absolute left-4 top-4 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white">{cameraReady ? 'Câmera ativa' : 'Inicializando...'}</span>
              <button type="button" onClick={() => photo ? setPhoto(null) : capture()} className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border-4 border-white bg-sky-600 px-6 py-4 text-xs font-bold text-white shadow-xl">{photo ? 'REFAZER' : 'CAPTURAR'}</button>
            </div>
            {cameraError && <p className="mt-2 text-xs text-red-600">{cameraError}</p>}
          </section>
          <section className="flex flex-col gap-4">
            <div className="h-56 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
              {position ? <LocationMap position={position} config={config} /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">Obtendo localização GPS...</div>}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-xs">
              <div><p className="text-slate-400">Filial</p><p className="mt-1 font-semibold text-slate-700">{config.branch.name}</p></div>
              <div><p className="text-slate-400">Precisão GPS</p><p className="mt-1 font-semibold text-slate-700">{position ? `± ${Math.round(position.accuracy)} m` : '—'}</p></div>
            </div>
            {locationError && <p className="text-xs text-red-600">{locationError}</p>}
            <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de marcação</p><div className="grid grid-cols-2 gap-2">{punchOptions.map((option) => <button key={option.type} type="button" onClick={() => setType(option.type)} className={`rounded-xl border p-3 text-left transition ${type === option.type ? 'border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><span className="mr-2 text-[10px] font-black">{option.short}</span><span className="text-xs font-semibold">{option.label}</span></button>)}</div></div>
            {actionError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}
            {!config.collaborator.biometricEnrolled ? (
              <button type="button" disabled={enrolling || !photo} onClick={() => void enroll()} className="mt-auto rounded-2xl bg-violet-700 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-40">{enrolling ? 'Cadastrando...' : 'Cadastrar biometria com consentimento'}</button>
            ) : (
              <button type="button" disabled={submitting || !position || !photo} onClick={() => void register()} className="mt-auto rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-40">{submitting ? 'Validando GPS e biometria...' : 'Confirmar marcação'}</button>
            )}
          </section>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
