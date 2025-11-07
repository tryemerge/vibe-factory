#!/bin/bash

# Fart sound generator script
# Works on macOS using the 'say' command with various sound effects

echo "💨 Preparing to fart..."
sleep 0.5

# Try different methods based on what's available
if command -v say &> /dev/null; then
    # macOS text-to-speech with fart-like sounds
    echo "💨 *PFFFFFFFFT*"
    say -v Zarvox "[[slnc 100]]pthhhhhhhhhh[[slnc 50]]ffffffffffft[[slnc 100]]" 2>/dev/null || \
    say "pthhhhhhhh ffffffffft" 2>/dev/null
elif command -v espeak &> /dev/null; then
    # Linux espeak
    echo "💨 *PFFFFFFFFT*"
    espeak "pfffffffffffffffft" -s 50 2>/dev/null
elif command -v beep &> /dev/null; then
    # Beep pattern (requires beep package on Linux)
    echo "💨 *PFFFFFFFFT*"
    beep -f 100 -l 500 -D 50 -r 3 2>/dev/null
elif command -v afplay &> /dev/null; then
    # If there's a sound file, play it
    echo "💨 *PFFFFFFFFT*"
    echo "(No sound file available, but imagine a glorious fart sound here)"
else
    # Fallback: just print ASCII art
    echo "💨 *PFFFFFFFFT*"
    echo "   ___"
    echo "  (o o)"
    echo " (  V  )"
    echo "  \\___/"
    echo "   |_|"
    echo "  💨💨💨"
fi

echo ""
echo "✨ Ahhhh, much better!"
