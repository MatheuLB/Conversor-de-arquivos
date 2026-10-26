# Converta

Conversor de arquivos que funciona **no navegador** e como **app para Windows, macOS e Linux**.
A conversão acontece no próprio dispositivo: nenhum arquivo é enviado para servidor.

| Tipo | Abre | Converte para |
|---|---|---|
| Imagem | PNG, JPG, WEBP, GIF, BMP, ICO, TIFF, AVIF, HEIC (iPhone), SVG | PNG, JPG, WEBP, GIF, BMP, ICO, TIFF, PDF (e AVIF quando o navegador permite) |
| PDF | PDF | PNG, JPG, WEBP (uma imagem por página), TXT |
| Vídeo | MP4, WEBM, MOV, MKV, AVI, M4V, WMV, FLV, 3GP, MPEG | MP4, WEBM, MOV, MKV, AVI, GIF, MP3, WAV, OGG, M4A, FLAC |
| Áudio | MP3, WAV, OGG, M4A, AAC, FLAC, OPUS, WMA, AMR | MP3, WAV, OGG, M4A, AAC, FLAC, OPUS |
| Documento | DOCX, MD, HTML, TXT | PDF, HTML, MD, TXT |
| Dados | XLSX, CSV, TSV, JSON, YAML, XML | XLSX, CSV, TSV, JSON, YAML, XML, HTML |

Extras: converter vários arquivos de uma vez, juntar imagens e PDFs em um único PDF, baixar tudo em .zip,
colar imagens com Ctrl+V e ajustar qualidade, tamanho e resolução.

---

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm run dev        # abre o site em http://localhost:5173
npm run app        # abre o app de computador (Electron)
```

## Publicar o site (grátis, GitHub Pages)

1. Crie um repositório no GitHub e envie este projeto para a branch `main`.
2. No repositório, abra **Settings → Pages** e, em **Source**, escolha **GitHub Actions**.
3. Pronto: a cada `git push` na `main`, o workflow **Publicar site** (`.github/workflows/site.yml`)
   gera e publica o site em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

O site é só arquivos estáticos (a pasta `dist/` depois de `npm run build`), então também funciona
na Netlify, Vercel, Cloudflare Pages ou qualquer hospedagem.

## Gerar os apps para Windows, macOS e Linux

O workflow **Gerar apps** (`.github/workflows/apps.yml`) monta os três instaladores nas máquinas do GitHub.
Para lançar uma versão:

```bash
# troque "version" no package.json, depois:
git tag v1.0.0
git push origin v1.0.0
```

Em uns 10 minutos aparece uma **Release** no GitHub com:

- `Converta-Setup.exe` — instalador do Windows
- `Converta-mac.dmg` — macOS (Intel e Apple Silicon)
- `Converta-linux.AppImage` — Linux (é só dar permissão de execução e abrir)

Os botões **Baixar o app** do site apontam para a Release mais recente automaticamente.

Também dá para gerar no próprio computador: `npm run dist:win` (no Windows), `npm run dist:mac` (no Mac)
ou `npm run dist:linux` (no Linux). Os arquivos saem na pasta `release/`.

### Avisos de segurança na primeira abertura

Os apps não têm assinatura digital paga, então o sistema avisa na primeira vez:

- **Windows:** “O Windows protegeu o computador” → **Mais informações** → **Executar assim mesmo**.
- **macOS:** Ajustes do Sistema → **Privacidade e Segurança** → **Abrir Mesmo Assim**.

Para remover os avisos é preciso comprar um certificado de assinatura de código (Windows) e entrar no
Apple Developer Program (US$ 99/ano). O electron-builder usa esses certificados se você configurar as
variáveis `CSC_LINK` e `CSC_KEY_PASSWORD` nos segredos do repositório.

## Limitações

- **Vídeos grandes:** o FFmpeg roda em WebAssembly com um núcleo só, então vídeos longos demoram mais que
  num programa nativo, e o limite é cerca de 1,5 GB por arquivo.
- **Documento → PDF no navegador:** abre a janela de impressão; escolha “Salvar como PDF”.
  No app de computador o PDF é gerado direto.
- **Formatos antigos do Office** (`.doc`, `.xls`, `.ppt`) não são lidos. Salve como `.docx`/`.xlsx` antes.
- **GIF animado → imagem** usa só o primeiro quadro (para manter a animação, converta para MP4 ou WEBM).
- **PDF → TXT** só extrai texto selecionável; PDFs escaneados (imagem) não têm OCR.
- **TXT → PDF no navegador** usa a fonte Helvetica: caracteres fora do alfabeto latino viram “?”.
  No app de computador todos os caracteres funcionam.

## Como o código está organizado

```
index.html              página
src/main.js             interface: fila de arquivos, botões, arrastar e soltar
src/formats.js          lista de formatos e para onde cada um pode ser convertido
src/convert.js          escolhe o conversor certo para cada arquivo
src/engines/image.js    imagens (Canvas, heic2any, UTIF, gifenc, pdf-lib)
src/engines/pdf.js      PDF → imagem/texto e juntar PDFs (pdf.js, pdf-lib)
src/engines/media.js    áudio e vídeo (FFmpeg WebAssembly)
src/engines/document.js Word, Markdown, HTML e texto (mammoth, marked, turndown)
src/engines/data.js     planilhas e dados (read/write-excel-file, PapaParse, yaml, fast-xml-parser)
src/downloads.js        links da seção “Baixar o app”
electron/               app de computador (janela, gerar PDF, segurança)
.github/workflows/      publicação automática do site e dos apps
```

Para adicionar um formato: registre-o em `src/formats.js` (extensão, tipo e para onde pode ir) e trate a
conversão no motor correspondente em `src/engines/`.

## Licença

GPL-3.0-or-later. O projeto inclui o FFmpeg (GPL), então quem distribuir o app precisa manter o código-fonte
aberto sob a mesma licença.
