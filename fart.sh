#!/bin/bash

# Fart Sound Generator
# Usage: ./fart.sh

echo "💨 Preparing to fart..."

# Try different methods based on what's available
if command -v say &> /dev/null && [ "$(uname)" = "Darwin" ]; then
    # macOS: Use say command with Zarvox voice for robotic farting sound
    say -v Zarvox "prrrrrrrbt" &
    sleep 0.5
    say -v Zarvox "poot" &
    wait
elif command -v paplay &> /dev/null; then
    # Linux with PulseAudio
    echo "Linux fart sound not implemented. Install 'sox' or 'beep' for sound effects."
    echo "💨 PFFFFFFFFRRRRRTTTTT! 💨"
elif command -v speaker-test &> /dev/null; then
    # Linux fallback
    speaker-test -t sine -f 80 -l 1 &> /dev/null &
    SPEAKER_PID=$!
    sleep 0.3
    kill $SPEAKER_PID 2>/dev/null
else
    # Ultimate fallback: ASCII art fart
    echo "💨 PFFFFFFFFRRRRRTTTTT! 💨"
    echo "   ___"
    echo "  (   )"
    echo "   ) ("
    echo "  (   )"
    echo "   ) ("
    echo "~~~~~~~~~~"
fi

echo "💨 Complete!"
