# Make the promo video, the poster, the GIF preview and the README images.
# Usage (from any folder): pwsh tools/media/promo/build_promo.ps1
# Needs: Python with Playwright and numpy, and ffmpeg on PATH. Takes about 8 minutes.
# Output: docs/media/. Work files go to build/media/ (git ignores it).
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$promo = $PSScriptRoot
$work = Join-Path $root 'build\media'
$media = Join-Path $root 'docs\media'
New-Item -ItemType Directory -Force $work | Out-Null

Push-Location $root
python tools/media/capture.py (Join-Path $work 'shots')
python (Join-Path $promo 'audio.py')
python (Join-Path $promo 'render.py') frames
python (Join-Path $promo 'render.py') stills 2.6 9.9 13.8 16.5 21.0
Pop-Location

Push-Location $work
# Frame 0 is the poster, so a player that shows the first frame shows a good picture.
Copy-Item frames\f_00210.png poster.png -Force
Copy-Item poster.png frames\f_00000.png -Force
ffmpeg -y -loglevel error -framerate 30 -i frames\f_%05d.png -i audio.wav -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart (Join-Path $media 'promo.mp4')
ffmpeg -y -loglevel error -i poster.png -q:v 2 (Join-Path $media 'promo-poster.jpg')
ffmpeg -y -loglevel error -framerate 30 -start_number 1 -i frames\f_%05d.png -vf "fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" (Join-Path $media 'promo-preview.gif')
$map = @{ 't_02.60' = '01-before'; 't_09.90' = '02-product'; 't_13.80' = '03-search'; 't_16.50' = '04-cart'; 't_21.00' = '05-settings' }
foreach ($k in $map.Keys) { ffmpeg -y -loglevel error -i "stills\$k.png" -vf scale=1280:-1 -q:v 3 (Join-Path $media "$($map[$k]).jpg") }
Pop-Location
'PROMO DONE'
