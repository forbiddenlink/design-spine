# Terminal demo for the README. Regenerate with: vhs docs/demo.tape
# Needs vhs, ttyd and ffmpeg on PATH, and Bun. Copies fixtures/demo-site to /tmp/my-app so no local path shows.
Output docs/images/cli-demo.gif
Output site/media/cli-demo.mp4
Output site/media/cli-demo.webm
Set Shell zsh
Set FontSize 15
Set Width 1000
Set Height 620
Set Padding 20
Set TypingSpeed 40ms
Hide
Type `R=$PWD && rm -rf /tmp/my-app && cp -R fixtures/demo-site /tmp/my-app && cd /tmp/my-app && rm -rf .design-spine && (bun serve.ts 4010 >/dev/null 2>&1 &) && alias spine="bun $R/src/cli.ts" && PS1='$ ' && clear` Enter
Sleep 1500ms
Show
Type "spine doctor" Enter
Sleep 2500ms
Type "spine capture" Enter
Sleep 16s
Type "spine diff" Enter
Sleep 4s
Hide
Type "pkill -f 'serve.ts 4010'" Enter
Sleep 500ms
