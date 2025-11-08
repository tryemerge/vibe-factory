#!/bin/bash

# Fart sound generator
# This script plays a fart sound using the system's audio capabilities

# Check if we're on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Use 'say' command with special voice settings for a fart-like sound
    say -v Zarvox "pppppbbbbttthhh" &
    sleep 0.3
    say -v Cellos "[[volm 0.3]] [[rate 50]] brrrrrrrrrt" &
elif command -v espeak &> /dev/null; then
    # Use espeak on Linux
    espeak -v en -p 10 -s 100 "pppppbbbbttthhh brrrrrt" 2>/dev/null
elif command -v beep &> /dev/null; then
    # Fallback to beep command with fart-like frequencies
    beep -f 100 -l 300 -r 2 -d 50
    beep -f 80 -l 500
else
    # ASCII art fart as last resort
    echo "💨"
    echo "  ___  "
    echo " /   \\ "
    echo "|  💨 |"
    echo " \\___/ "
    echo ""
    echo "*pppppbbbbtttt*"
    echo "*brrrrrrrrt*"
fi

echo "💨 Fart deployed successfully! 💨"
