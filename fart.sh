#!/bin/bash

# Fart Sound Generator
# This script uses macOS 'say' command with creative phonetics to simulate a fart sound

# Array of different fart sound variations
fart_sounds=(
    "[[rate 400]] pppppppppfffftttt"
    "[[rate 350]] brrrrraaaaaappp"
    "[[rate 450]] pppffffrrrt"
    "[[rate 300]] bbbrrrrrrtttttt"
    "[[rate 380]] ppppfffffftttthhhhh"
)

# Pick a random fart sound
random_index=$((RANDOM % ${#fart_sounds[@]}))
selected_sound="${fart_sounds[$random_index]}"

# Check if 'say' command is available (macOS)
if command -v say &> /dev/null; then
    echo "💨 *FART* 💨"
    say "$selected_sound"
else
    # Fallback for non-macOS systems
    echo "💨 *PPPPPFFFFTTTT* 💨"
    echo "Note: Install 'espeak' or 'festival' for audio on Linux"

    # Try espeak if available
    if command -v espeak &> /dev/null; then
        espeak -s 400 "pppppppppfffftttt" 2>/dev/null
    elif command -v spd-say &> /dev/null; then
        spd-say -r 80 "pppppppppfffftttt" 2>/dev/null
    fi
fi

exit 0
