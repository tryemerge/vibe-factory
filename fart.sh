#!/bin/bash
# Fart sound generator script

# Check if 'say' command is available (macOS)
if command -v say &> /dev/null; then
    # Use macOS text-to-speech with a low-pitched voice and onomatopoeia
    say -v "Bad News" -r 50 "pppppbbbbbtttttttt"
# Check if 'espeak' is available (Linux)
elif command -v espeak &> /dev/null; then
    espeak -p 10 -s 50 "pppppbbbbbtttttttt"
# Check if 'beep' is available (fallback for Linux)
elif command -v beep &> /dev/null; then
    beep -f 100 -l 500 -D 50 -n -f 80 -l 300
else
    # Fallback: just print the sound
    echo "💨 *PPPPPBBBBBTTTTTT* 💨"
    echo "(Install 'espeak' or 'beep' for actual sound on Linux)"
fi
