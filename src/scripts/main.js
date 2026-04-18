/**
 * Simple Soundboard Module for Foundry VTT
 * Un soundboard interactivo con botones configurables
 */

const MODULE_ID = 'simple-soundboard';

// Configuración por defecto
const DEFAULT_SETTINGS = {
  sounds: [],
  columns: 4,
  buttonSize: 80
};

/**
 * Clase principal del Soundboard
 */
class MusPadSoundboard extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.sounds = game.settings.get(MODULE_ID, 'sounds') || [];
    this.currentlyPlaying = new Map();
    this.previewSound = null;
  }

  static DEFAULT_OPTIONS = {
    id: 'simple-soundboard-soundboard',
    tag: 'form',
    window: {
      icon: 'fas fa-th',
      resizable: true,
      minimizable: true
    },
    position: {
      width: 500,
      height: 'auto'
    },
    classes: ['simple-soundboard-app']
  };

  _prepareOptions(options = {}) {
    options = super._prepareOptions(options);
    options.window.title = game.i18n.localize('SIMPLE-SOUNDBOARD.Title');
    return options;
  }

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/src/templates/soundboard.hbs`
    }
  };

  async _prepareContext(options = {}) {
    return {
      sounds: this.sounds,
      columns: game.settings.get(MODULE_ID, 'columns'),
      buttonSize: game.settings.get(MODULE_ID, 'buttonSize'),
      isGM: game.user.isGM
    };
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    
    // Convertir HTMLElement a jQuery para compatibilidad
    const html = $(htmlElement);

    if (partId === 'form') {
      // Reproducir sonido al hacer clic en un botón
      html.find('.simple-soundboard-button').click(this._onPlaySound.bind(this));

      // Detener sonido con clic derecho
      html.find('.simple-soundboard-button').contextmenu(this._onStopSound.bind(this));

      // Botón para añadir nuevo sonido
      html.find('.simple-soundboard-add').click(this._onAddSound.bind(this));

      // Editar sonido con doble clic (solo GM)
      if (game.user.isGM) {
        html.find('.simple-soundboard-button').dblclick(this._onEditSound.bind(this));
      }

      // Botón para detener todos los sonidos
      html.find('.simple-soundboard-stop-all').click(this._onStopAllSounds.bind(this));

      // Control de volumen
      html.find('.volume-slider').on('input', this._onVolumeChange.bind(this));
    }
  }

  /**
   * Maneja el drop de archivos de audio
   */
  async _onDrop(event) {
    event.preventDefault();
    
    // Obtener datos del drop
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (e) {
      // Intentar obtener archivos locales
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        ui.notifications.info(game.i18n.localize('SIMPLE-SOUNDBOARD.DropFileNotSupported'));
        return;
      }
      return;
    }

    // Si es un archivo de sonido del FilePicker
    if (data.type === 'PlaylistSound' || data.type === 'Sound') {
      const soundPath = data.uuid ? await fromUuid(data.uuid).then(s => s?.path) : data.path;
      if (soundPath) {
        this._createSoundFromPath(soundPath);
      }
    }
  }

  /**
   * Crea un nuevo sonido desde una ruta
   */
  async _createSoundFromPath(path) {
    const name = path.split('/').pop().replace(/\.[^/.]+$/, '');
    const newSound = {
      id: foundry.utils.randomID(),
      name: name,
      path: path,
      volume: 0.8,
      loop: false,
      color: this._getRandomColor()
    };

    this.sounds.push(newSound);
    await this._saveSounds();
    this.render();
  }

  /**
   * Reproduce un sonido
   */
  async _onPlaySound(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const soundId = button.dataset.soundId;
    const sound = this.sounds.find(s => s.id === soundId);

    if (!sound) return;

    // Si ya está reproduciéndose, detenerlo
    if (this.currentlyPlaying.has(soundId)) {
      this._stopSound(soundId);
      return;
    }

    try {
      const playingSound = await foundry.audio.AudioHelper.play({
        src: sound.path,
        volume: sound.volume,
        loop: sound.loop
      }, true);

      this.currentlyPlaying.set(soundId, playingSound);
      button.classList.add('playing');

      // Cuando termine el sonido, actualizar el estado
      if (!sound.loop) {
        playingSound.addEventListener('end', () => {
          this.currentlyPlaying.delete(soundId);
          button.classList.remove('playing');
        });
      }
    } catch (e) {
      console.error(`MUS-Pad: Error playing sound ${sound.name}`, e);
      ui.notifications.error(game.i18n.format('SIMPLE-SOUNDBOARD.ErrorPlaying', { name: sound.name }));
    }
  }

  /**
   * Detiene un sonido específico
   */
  _stopSound(soundId) {
    const playingSound = this.currentlyPlaying.get(soundId);
    if (playingSound) {
      playingSound.stop();
      this.currentlyPlaying.delete(soundId);
      
      const button = $(this.element).find(`[data-sound-id="${soundId}"]`);
      button.removeClass('playing');
    }
  }

  /**
   * Detiene un sonido con clic derecho
   */
  _onStopSound(event) {
    event.preventDefault();
    const soundId = event.currentTarget.dataset.soundId;
    this._stopSound(soundId);
  }

  /**
   * Detiene todos los sonidos
   */
  _onStopAllSounds(event) {
    event.preventDefault();
    for (const [soundId] of this.currentlyPlaying) {
      this._stopSound(soundId);
    }
    ui.notifications.info(game.i18n.localize('SIMPLE-SOUNDBOARD.AllSoundsStopped'));
  }

  /**
   * Maneja el cambio de volumen en los sliders
   */
  async _onVolumeChange(event) {
    event.preventDefault();
    const soundId = event.currentTarget.dataset.soundId;
    const newVolume = parseFloat(event.currentTarget.value);
    
    // Actualizar el volumen en el array de sonidos
    const sound = this.sounds.find(s => s.id === soundId);
    if (sound) {
      sound.volume = newVolume;
      
      // Actualizar título del slider con el nuevo volumen
      event.currentTarget.title = `Volumen: ${(newVolume * 100).toFixed(0)}%`;
      
      // Si el sonido se está reproduciendo, actualizar su volumen
      if (this.currentlyPlaying.has(soundId)) {
        const playingSound = this.currentlyPlaying.get(soundId);
        if (playingSound) {
          playingSound.volume = newVolume;
        }
      }
      
      // Guardar los cambios
      await this._saveSounds();
    }
  }

  /**
   * Abre el diálogo para añadir un nuevo sonido
   */
  async _onAddSound(event) {
    event.preventDefault();
    console.log('[MusPadSoundboard] Opening add sound dialog');
    new MusPadSoundConfig({}, async (soundData) => {
      console.log('[MusPadSoundboard] Add sound callback - soundData:', soundData);
      this.sounds.push({
        id: foundry.utils.randomID(),
        ...soundData
      });
      console.log('[MusPadSoundboard] Sound added to array, total sounds:', this.sounds.length);
      console.log('[MusPadSoundboard] Saving sounds to settings...');
      await this._saveSounds();
      console.log('[MusPadSoundboard] Sounds saved, re-rendering soundboard...');
      await this.render();
      console.log('[MusPadSoundboard] Soundboard rendered');
    }).render(true);
  }

  /**
   * Abre el diálogo para editar un sonido existente
   */
  async _onEditSound(event) {
    event.preventDefault();
    const soundId = event.currentTarget.dataset.soundId;
    console.log('[MusPadSoundboard] Opening edit dialog for sound:', soundId);
    const sound = this.sounds.find(s => s.id === soundId);
    
    if (!sound) {
      console.warn('[MusPadSoundboard] Sound not found:', soundId);
      return;
    }

    new MusPadSoundConfig(sound, async (soundData) => {
      console.log('[MusPadSoundboard] Edit sound callback - soundData:', soundData);
      const index = this.sounds.findIndex(s => s.id === soundId);
      if (index !== -1) {
        console.log('[MusPadSoundboard] Updating sound at index:', index);
        this.sounds[index] = { ...sound, ...soundData };
        console.log('[MusPadSoundboard] Sound updated, saving...');
        await this._saveSounds();
        console.log('[MusPadSoundboard] Sound saved, re-rendering...');
        await this.render();
        console.log('[MusPadSoundboard] Soundboard rendered');
      }
    }, async () => {
      // Callback para eliminar
      console.log('[MusPadSoundboard] Delete callback for sound:', soundId);
      this.sounds = this.sounds.filter(s => s.id !== soundId);
      this._stopSound(soundId);
      console.log('[MusPadSoundboard] Sound deleted, saving...');
      await this._saveSounds();
      console.log('[MusPadSoundboard] Sounds saved after deletion, re-rendering...');
      await this.render();
      console.log('[MusPadSoundboard] Soundboard rendered');
    }).render(true);
  }

  /**
   * Guarda los sonidos en la configuración
   */
  async _saveSounds() {
    console.log('[MusPadSoundboard] _saveSounds() - Saving', this.sounds.length, 'sounds');
    console.log('[MusPadSoundboard] Sound data:', this.sounds);
    try {
      await game.settings.set(MODULE_ID, 'sounds', this.sounds);
      console.log('[MusPadSoundboard] Sounds saved successfully');
    } catch (e) {
      console.error('[MusPadSoundboard] Error saving sounds:', e);
    }
  }

  /**
   * Genera un color aleatorio para los botones
   */
  _getRandomColor() {
    const colors = [
      '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
      '#9b59b6', '#1abc9c', '#e91e63', '#00bcd4',
      '#ff5722', '#795548', '#607d8b', '#8bc34a'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

/**
 * Diálogo de configuración de sonido individual
 */
class MusPadSoundConfig extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(sound = {}, onSubmit, onDelete) {
    super({});
    this.sound = sound;
    this.onSubmit = onSubmit;
    this.onDelete = onDelete;
    this.previewSound = null;
  }

  static DEFAULT_OPTIONS = {
    id: 'simple-soundboard-sound-config',
    tag: 'form',
    window: {
      icon: 'fas fa-edit'
    },
    position: {
      width: 400,
      height: 'auto'
    },
    classes: ['simple-soundboard-config']
  };

  _prepareOptions(options = {}) {
    options = super._prepareOptions(options);
    options.window.title = game.i18n.localize('SIMPLE-SOUNDBOARD.ConfigureSound');
    return options;
  }

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/src/templates/sound-config.hbs`
    }
  };

  async _prepareContext(options = {}) {
    const playlists = game.playlists.contents.map(p => ({
      id: p.id,
      name: p.name
    }));

    let sounds = [];
    if (this.sound.playlistId) {
      const playlist = game.playlists.get(this.sound.playlistId);
      if (playlist) {
        sounds = playlist.sounds.map(s => ({
          id: s.id,
          name: s.name
        }));
      }
    }

    return {
      sound: this.sound,
      isNew: !this.sound.id,
      defaultColor: '#3498db',
      playlists: playlists,
      sounds: sounds
    };
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    
    // Convertir HTMLElement a jQuery para compatibilidad
    const html = $(htmlElement);

    if (partId === 'form') {
      // Listener para cambio de playlist
      html.find('#playlistId').change(this._onPlaylistChange.bind(this));

      // Botón de eliminar
      html.find('.delete-sound').click(this._onDelete.bind(this));

      // Preview del sonido
      html.find('.preview-sound').click(this._onPreview.bind(this));
      
      // Detener preview
      html.find('.stop-preview').click(this._onStopPreview.bind(this));
      
      // Actualizar el display del volumen en tiempo real
      html.find('input[name="volume"]').on('input', (event) => {
        const value = $(event.target).val();
        html.find('.range-value').text(value);
      });
      
      // Botón de guardar - CUSTOM LISTENER, NO _onSubmit
      html.find('.save-sound').click(this._onSaveSound.bind(this));
    }
  }

  async _onStopPreview(event) {
    event.preventDefault();
    if (this.previewSound) {
      this.previewSound.stop();
      this.previewSound = null;
    }
  }

  async _onPlaylistChange(event) {
    const playlistId = $(event.target).val();
    this.sound.playlistId = playlistId;
    this.sound.soundId = ''; // Limpiar selección de sonido
    await this.render();
  }

  async _onPreview(event) {
    event.preventDefault();
    const playlistId = $(this.form).find('#playlistId').val();
    const soundId = $(this.form).find('#soundId').val();
    
    if (!playlistId || !soundId) {
      ui.notifications.warn(game.i18n.localize('SIMPLE-SOUNDBOARD.SelectSoundFirst'));
      return;
    }
    
    // Detener el sonido anterior si hay uno en preview
    if (this.previewSound) {
      this.previewSound.stop();
      this.previewSound = null;
    }
    
    const playlist = game.playlists.get(playlistId);
    if (!playlist) return;
    
    const sound = playlist.sounds.get(soundId);
    if (!sound) return;
    
    const volume = parseFloat($(this.form).find('input[name="volume"]').val()) || 0.8;
    
    this.previewSound = await foundry.audio.AudioHelper.play({
      src: sound.path,
      volume: volume,
      loop: false
    }, false);
  }

  async close(options = {}) {
    console.log('[MusPadSoundConfig] Closing dialog');
    // Detener el sonido en preview al cerrar
    if (this.previewSound) {
      console.log('[MusPadSoundConfig] Stopping preview sound');
      this.previewSound.stop();
      this.previewSound = null;
    }
    console.log('[MusPadSoundConfig] Calling super.close()');
    const result = await super.close(options);
    console.log('[MusPadSoundConfig] Dialog closed, result:', result);
    return result;
  }

  _onDelete(event) {
    event.preventDefault();
    if (this.onDelete) {
      Dialog.confirm({
        title: game.i18n.localize('SIMPLE-SOUNDBOARD.DeleteSound'),
        content: game.i18n.localize('SIMPLE-SOUNDBOARD.DeleteSoundConfirm'),
        yes: () => {
          this.onDelete();
          this.close();
        }
      });
    }
  }

  async _onSaveSound(event) {
    console.log('[MusPadSoundConfig] _onSaveSound - START');
    event.preventDefault();
    
    const form = $(this.form);
    const playlistId = form.find('#playlistId').val();
    const soundId = form.find('#soundId').val();
    
    console.log('[MusPadSoundConfig] Validating: playlistId=', playlistId, 'soundId=', soundId);
    
    if (!playlistId || !soundId) {
      console.warn('[MusPadSoundConfig] Validation failed');
      ui.notifications.error(game.i18n.localize('SIMPLE-SOUNDBOARD.SelectSoundFirst'));
      return;
    }
    
    const playlist = game.playlists.get(playlistId);
    if (!playlist) {
      console.warn('[MusPadSoundConfig] Playlist not found');
      ui.notifications.error(game.i18n.localize('SIMPLE-SOUNDBOARD.PlaylistNotFound'));
      return;
    }
    
    const sound = playlist.sounds.get(soundId);
    if (!sound) {
      console.warn('[MusPadSoundConfig] Sound not found');
      ui.notifications.error(game.i18n.localize('SIMPLE-SOUNDBOARD.SoundNotFound'));
      return;
    }
    
    const soundData = {
      name: form.find('input[name="name"]').val() || sound.name,
      playlistId: playlistId,
      soundId: soundId,
      path: sound.path,
      volume: parseFloat(form.find('input[name="volume"]').val()) || 0.8,
      loop: form.find('input[name="loop"]').is(':checked') || false,
      color: form.find('input[name="color"]').val() || '#3498db'
    };
    
    console.log('[MusPadSoundConfig] Sound data prepared:', soundData);
    
    if (this.onSubmit) {
      console.log('[MusPadSoundConfig] Calling onSubmit callback');
      await this.onSubmit(soundData);
      console.log('[MusPadSoundConfig] onSubmit callback completed');
    }
    
    console.log('[MusPadSoundConfig] Closing dialog');
    await this.close();
    console.log('[MusPadSoundConfig] _onSaveSound - END');
  }
}

/**
 * Inicialización del módulo
 */
Hooks.once('init', () => {
  console.log(`Simple Soundboard | Initializing Module`);

  // Registrar configuraciones
  game.settings.register(MODULE_ID, 'sounds', {
    name: 'Soundboard Sounds',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, 'columns', {
    name: game.i18n.localize('SIMPLE-SOUNDBOARD.Settings.Columns'),
    hint: game.i18n.localize('SIMPLE-SOUNDBOARD.Settings.ColumnsHint'),
    scope: 'client',
    config: true,
    type: Number,
    default: 4,
    range: {
      min: 2,
      max: 8,
      step: 1
    }
  });

  game.settings.register(MODULE_ID, 'buttonSize', {
    name: game.i18n.localize('SIMPLE-SOUNDBOARD.Settings.ButtonSize'),
    hint: game.i18n.localize('SIMPLE-SOUNDBOARD.Settings.ButtonSizeHint'),
    scope: 'client',
    config: true,
    type: Number,
    default: 80,
    range: {
      min: 50,
      max: 150,
      step: 10
    }
  });
});

Hooks.once('ready', () => {
  console.log(`[Simple Soundboard] Ready - Initializing soundboard`);
  console.log(`[Simple Soundboard] Creating global soundboard instance`);
  
  // Crear instancia global del soundboard
  game.simpleSoundboard = {
    soundboard: new MusPadSoundboard(),
    open: () => {
      console.log('[Simple Soundboard] Opening soundboard');
      return game.simpleSoundboard.soundboard.render(true);
    }
  };
  console.log(`[Simple Soundboard] Soundboard ready`);
});

// Añadir botón en los controles de escena (v13)
Hooks.on('getSceneControlButtons', (controls) => {
  const soundsControl = controls.sounds;
  
  if (soundsControl) {
    soundsControl.tools['simple-soundboard'] = {
      name: 'simple-soundboard',
      title: game.i18n.localize('SIMPLE-SOUNDBOARD.Title'),
      icon: 'fas fa-th',
      button: true,
      onChange: (isActive) => {
        if (isActive && game.simpleSoundboard) {
          game.simpleSoundboard.open();
        }
      }
    };
  }
});

// Atajos de teclado (debe estar en 'init', no en 'ready' para v13+)
Hooks.once('init', () => {
  game.keybindings.register(MODULE_ID, 'openSoundboard', {
    name: game.i18n.localize('SIMPLE-SOUNDBOARD.Keybinding.Open'),
    hint: game.i18n.localize('SIMPLE-SOUNDBOARD.Keybinding.OpenHint'),
    editable: [{ key: 'KeyS', modifiers: ['Control', 'Shift'] }],
    onDown: () => {
      if (game.simpleSoundboard) {
        game.simpleSoundboard.open();
      }
      return true;
    }
  });
});
