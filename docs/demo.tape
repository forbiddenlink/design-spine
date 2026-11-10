# Terminal demo for the README. Regenerate with: vhs docs/demo.tape
# Needs vhs, ttyd and ffmpeg on PATH, and Bun. Runs against fixtures/demo-site.
Output docs/images/cli-demo.gif
Set Shell zsh
Set FontSize 15
Set Width 1000
Set Height 620
Set Padding 20
Set TypingSpeed 40ms
Hide
Type "cd fixtures/demo-site && (bun serve.ts 4010 >/dev/null 2>&1 &) && alias spine='bun ../../src/cli.ts' && PS1='$ ' && clear" Enter
Sleep 1500ms
Show
Type "spine doctor" Enter
Sleep 2500ms
Type "spine capture" Enter
Sleep 10s
Type "spine diff" Enter
Sleep 4s
Hide
Type "pkill -f 'serve.ts 4010'" Enter
Sleep 500ms
