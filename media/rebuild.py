"""Reassemble the approved picture and audio masters; requires FFmpeg on PATH."""
from pathlib import Path
import os, subprocess

root=Path(__file__).resolve().parent
ffmpeg=os.environ.get('FFMPEG','ffmpeg')
out=root/'output';out.mkdir(exist_ok=True)
for name,audio in [('voice','voice.flac'),('music','music-mix.flac')]:
    subprocess.run([ffmpeg,'-hide_banner','-v','error','-y',
        '-i',str(root/'source/picture.mp4'),'-i',str(root/'source'/audio),
        '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k',
        '-t','118','-map_metadata','-1','-movflags','+faststart',
        str(out/f'film-r10-{name}.mp4')],check=True)
    print(f'Created {out.name}/film-r10-{name}.mp4')
