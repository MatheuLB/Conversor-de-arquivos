import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { kindOf, labelOf, mimeOf } from '../formats.js';
import { UserError, outName } from '../util.js';

// O FFmpeg (versão WebAssembly) tem ~30 MB e só é carregado no primeiro uso.
let ffmpeg = null;
let ready = null;
let cancelled = false;
const log = [];

async function getFFmpeg() {
  if (!ready) {
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      log.push(message);
      if (log.length > 40) log.shift();
    });
    ready = ffmpeg.load({ coreURL, wasmURL }).catch(() => {
      ffmpeg = null;
      ready = null;
      throw new UserError('Não foi possível carregar o conversor de áudio e vídeo. Verifique a conexão e tente de novo.');
    });
  }
  await ready;
  return ffmpeg;
}

export function cancel() {
  if (!ffmpeg) return;
  cancelled = true;
  ffmpeg.terminate();
  ffmpeg = null;
  ready = null;
}

const VIDEO = {
  alta: { crf: 20, vp8: 8, vp8rate: '4M', mpeg4: 3 },
  media: { crf: 23, vp8: 12, vp8rate: '2M', mpeg4: 5 },
  baixa: { crf: 28, vp8: 20, vp8rate: '1M', mpeg4: 9 },
};

// libx264 exige largura e altura pares.
const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

function argsFor(outExt, s) {
  const q = VIDEO[s.videoQuality] || VIDEO.media;
  const ab = `${s.audioBitrate || 192}k`;
  const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(q.crf), '-pix_fmt', 'yuv420p', '-vf', EVEN];
  switch (outExt) {
    case 'mp4':
    case 'mov':
      return [...h264, '-c:a', 'aac', '-b:a', ab, '-movflags', '+faststart', '-sn', '-dn'];
    case 'mkv':
      return [...h264, '-c:a', 'aac', '-b:a', ab, '-sn', '-dn'];
    case 'webm':
      return ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-crf', String(q.vp8), '-b:v', q.vp8rate,
        '-c:a', 'libopus', '-b:a', ab, '-sn', '-dn'];
    case 'avi':
      return ['-c:v', 'mpeg4', '-q:v', String(q.mpeg4), '-vf', EVEN, '-c:a', 'libmp3lame', '-b:a', ab, '-sn', '-dn'];
    case 'gif':
      return ['-vf', "fps=12,scale='min(480,iw)':-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
        '-loop', '0', '-an'];
    case 'mp3':
      return ['-vn', '-c:a', 'libmp3lame', '-b:a', ab];
    case 'wav':
      return ['-vn', '-c:a', 'pcm_s16le'];
    case 'ogg':
      return ['-vn', '-c:a', 'libvorbis', '-b:a', ab];
    case 'm4a':
    case 'aac':
      return ['-vn', '-c:a', 'aac', '-b:a', ab];
    case 'flac':
      return ['-vn', '-c:a', 'flac'];
    case 'opus':
      return ['-vn', '-c:a', 'libopus', '-b:a', ab];
    default:
      throw new UserError(`Conversão para ${labelOf(outExt)} não suportada.`);
  }
}

function explainFailure(inExt, outExt) {
  const text = log.join('\n');
  if (/does not contain any stream|matches no streams|Output file is empty/i.test(text)) {
    return kindOf(outExt) === 'audio'
      ? 'Este arquivo não tem faixa de áudio para extrair.'
      : 'Este arquivo não tem uma faixa de vídeo.';
  }
  if (/Invalid data found|could not find codec parameters|moov atom not found/i.test(text)) {
    return `Não foi possível ler este ${labelOf(inExt)}. O arquivo pode estar corrompido ou incompleto.`;
  }
  if (/memory|OOM|Aborted/i.test(text)) {
    return 'O arquivo é grande demais para converter aqui. Tente um arquivo menor ou use o app para computador.';
  }
  const last = log.filter((l) => l.trim()).slice(-1)[0] || 'erro desconhecido';
  return `A conversão falhou (${last.trim().slice(0, 140)}).`;
}

const MAX_BYTES = 1.5 * 1024 ** 3;

export async function convert(file, inExt, outExt, settings, onProgress) {
  if (file.size > MAX_BYTES) {
    throw new UserError('Arquivos acima de 1,5 GB não cabem na memória do conversor. Divida o arquivo e tente de novo.');
  }
  onProgress?.(0, 'Carregando conversor…');
  const ff = await getFFmpeg();
  const input = `entrada.${inExt}`;
  const output = `saida.${outExt}`;
  const onFfProgress = ({ progress }) => {
    if (Number.isFinite(progress)) onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  cancelled = false;
  log.length = 0;
  await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
  ff.on('progress', onFfProgress);
  let code;
  try {
    onProgress?.(0, 'Convertendo…');
    code = await ff.exec(['-hide_banner', '-i', input, ...argsFor(outExt, settings), '-y', output]);
  } catch (err) {
    if (cancelled) throw new UserError('Conversão cancelada.');
    throw err;
  } finally {
    ff.off('progress', onFfProgress);
  }
  try {
    if (code !== 0) throw new UserError(explainFailure(inExt, outExt));
    const data = await ff.readFile(output);
    return [{ name: outName(file.name, outExt), blob: new Blob([data], { type: mimeOf(outExt) }) }];
  } finally {
    await ff.deleteFile(input).catch(() => {});
    await ff.deleteFile(output).catch(() => {});
  }
}
