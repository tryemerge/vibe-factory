#!/bin/bash

# Fart sound generator
# Uses 'say' command on macOS or 'espeak' on Linux

# Check which OS we're on and use appropriate TTS
if command -v say &> /dev/null; then
    # macOS - use 'say' with a low pitch and funny voice
    echo "💨 *PPPBBBTTTT* 💨"
    say -v Bubbles -r 300 "pppppbbbbbtttttttt" 2>/dev/null || \
    say -r 300 "pppppbbbbbtttttttt" 2>/dev/null
elif command -v espeak &> /dev/null; then
    # Linux - use espeak
    echo "💨 *PPPBBBTTTT* 💨"
    espeak -p 0 -s 300 "pppppbbbbbtttttttt" 2>/dev/null
elif command -v afplay &> /dev/null; then
    # Alternative for macOS - we could use afplay with a sound file
    # For now, just print
    echo "💨 *PPPBBBTTTT* 💨"
    echo "(Sound requires 'say' command)"
else
    # Fallback - just print
    echo "💨 *PPPBBBTTTT* 💨"
    echo "🎺 *TOOT TOOT* 🎺"
    echo "💨 *PFFFFFFFFFFT* 💨"
fi
