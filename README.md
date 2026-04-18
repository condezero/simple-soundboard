# Simple Soundboard

An interactive soundboard module for Foundry VTT v13+ with configurable buttons to play sound effects and music during your sessions.

## Features

- Configurable sound buttons with custom colors
- Real-time volume control for each sound
- Loop toggle for continuous playback
- Easy-to-use interface with responsive grid layout
- Multi-language support (English, Spanish)
- Playlist-based audio system

## Installation

1. In Foundry VTT, go to **Add-on Modules**
2. Click **Install Module**
3. Paste the manifest URL or search for "Simple Soundboard"
4. Click **Install**

## Quick Start Guide

### Step 1: Create a Playlist

Before adding sounds to the soundboard, you need to create a playlist in Foundry VTT:

1. Open the **Playlists** sidebar (left panel)
2. Click the **+** button to create a new playlist
3. Give it a name (e.g., "Combat Effects", "Music", "Ambience")
4. Click **Create Playlist**

### Step 2: Add Audio Files to Your Playlist

1. Click on your playlist to expand it
2. Click the **+** button next to the playlist name
3. Select **Add Sound**
4. Choose an audio file from your Foundry file browser
5. Configure the sound:
   - **Name**: Give it a descriptive name
   - **Volume**: Set the default volume level
   - **Loop**: Enable if you want it to repeat continuously
6. Click **Save Sound**

Repeat this process for all sounds you want to add to your soundboard.

### Step 3: Add Sounds to the Soundboard

1. Open the **Simple Soundboard** window from the top toolbar (click the speaker icon)
2. Click **Add Sound** button
3. In the configuration dialog:
   - **Name**: Enter a name for the button (e.g., "Thunder", "Victory")
   - **Select Playlist**: Choose the playlist containing your audio files
   - **Select Sound**: Choose the specific sound from that playlist
   - **Button Color**: Pick a color for the button
   - **Volume**: Adjust the default playback volume (0-1)
   - **Loop**: Enable if you want the sound to loop when played

4. Click **Preview** to test the sound
5. Click **Stop** to stop the preview
6. Click **Save** to add the button to your soundboard

### Step 4: Using Your Soundboard

- **Play**: Left-click any button to play the sound
- **Stop**: Right-click any button to stop playback
- **Volume Control**: Use the vertical slider on the right side of each button to adjust volume in real-time
- **Edit**: Double-click a button (GM only) to modify its settings
- **Stop All**: Click the "Stop All" button to stop all playing sounds at once

## Configuration

The soundboard remembers your settings and persists them across sessions. All sound configurations are stored in the module settings.

## Compatibility

- **Minimum**: Foundry VTT v13
- **Verified**: Foundry VTT v13

## License

MIT
