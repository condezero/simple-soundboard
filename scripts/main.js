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
class MusPadSoundboard extends Application {
  constructor(options = {}) {
    super(options);
    this.sounds = game.settings.get(MODULE_ID, 'sounds') || [];
    this.currentlyPlaying = new Map();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'simple-soundboard-soundboard',
      title: game.i18n.localize('SIMPLE-SOUNDBOARD.Title'),
      template: `modules/${MODULE_ID}/templates/soundboard.hbs`,
      classes: ['simple-soundboard-app'],
      width: 500,
      height: 'auto',
      minimizable: true,
      resizable: true,
      dragDrop: [{ dragSelector: null, dropSelector: '.simple-soundboard-grid' }]
    });
  }

  getData(options = {}) {
    return {
      sounds: this.sounds,
      columns: game.settings.get(MODULE_ID, 'columns'),
      buttonSize: game.settings.get(MODULE_ID, 'buttonSize'),
      isGM: game.user.isGM
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

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
      if (!sound.loop && playingSound.container) {
        playingSound.container.on('end', () => {
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
      
      const button = this.element.find(`[data-sound-id="${soundId}"]`);
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
   * Abre el diálogo para añadir un nuevo sonido
   */
  async _onAddSound(event) {
    event.preventDefault();
    new MusPadSoundConfig({}, (soundData) => {
      this.sounds.push({
        id: foundry.utils.randomID(),
        ...soundData
      });
      this._saveSounds();
      this.render();
    }).render(true);
  }

  /**
   * Abre el diálogo para editar un sonido existente
   */
  async _onEditSound(event) {
    event.preventDefault();
    const soundId = event.currentTarget.dataset.soundId;
    const sound = this.sounds.find(s => s.id === soundId);
    
    if (!sound) return;

    new MusPadSoundConfig(sound, (soundData) => {
      const index = this.sounds.findIndex(s => s.id === soundId);
      if (index !== -1) {
        this.sounds[index] = { ...sound, ...soundData };
        this._saveSounds();
        this.render();
      }
    }, () => {
      // Callback para eliminar
      this.sounds = this.sounds.filter(s => s.id !== soundId);
      this._stopSound(soundId);
      this._saveSounds();
      this.render();
    }).render(true);
  }

  /**
   * Guarda los sonidos en la configuración
   */
  async _saveSounds() {
    await game.settings.set(MODULE_ID, 'sounds', this.sounds);
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
class MusPadSoundConfig extends FormApplication {
  constructor(sound = {}, onSubmit, onDelete) {
    super(sound);
    this.sound = sound;
    this.onSubmit = onSubmit;
    this.onDelete = onDelete;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'simple-soundboard-sound-config',
      title: game.i18n.localize('SIMPLE-SOUNDBOARD.ConfigureSound'),
      template: `modules/${MODULE_ID}/templates/sound-config.hbs`,
      classes: ['simple-soundboard-config'],
      width: 400,
      height: 'auto'
    });
  }

  getData(options = {}) {
    return {
      sound: this.sound,
      isNew: !this.sound.id,
      defaultColor: '#3498db'
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // FilePicker para seleccionar el archivo de sonido
    html.find('.file-picker').click(this._onFilePicker.bind(this));

    // Botón de eliminar
    html.find('.delete-sound').click(this._onDelete.bind(this));

    // Preview del sonido
    html.find('.preview-sound').click(this._onPreview.bind(this));
  }

  async _onFilePicker(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: 'audio',
      current: this.sound.path || '',
      callback: path => {
        this.element.find('input[name="path"]').val(path);
        // Auto-rellenar el nombre si está vacío
        const nameInput = this.element.find('input[name="name"]');
        if (!nameInput.val()) {
          const name = path.split('/').pop().replace(/\.[^/.]+$/, '');
          nameInput.val(name);
        }
      }
    });
    fp.render(true);
  }

  async _onPreview(event) {
    event.preventDefault();
    const path = this.element.find('input[name="path"]').val();
    const volume = parseFloat(this.element.find('input[name="volume"]').val());
    
    if (path) {
      foundry.audio.AudioHelper.play({
        src: path,
        volume: volume,
        loop: false
      }, false);
    }
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

  async _updateObject(event, formData) {
    const soundData = {
      name: formData.name || game.i18n.localize('SIMPLE-SOUNDBOARD.Unnamed'),
      path: formData.path,
      volume: parseFloat(formData.volume) || 0.8,
      loop: formData.loop || false,
      color: formData.color || '#3498db',
      icon: formData.icon || 'fas fa-music'
    };

    if (!soundData.path) {
      ui.notifications.error(game.i18n.localize('SIMPLE-SOUNDBOARD.ErrorNoPath'));
      return;
    }

    if (this.onSubmit) {
      this.onSubmit(soundData);
    }
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
  console.log(`Simple Soundboard | Ready`);
  
  // Crear instancia global del soundboard
  game.simpleSoundboard = {
    soundboard: new MusPadSoundboard(),
    open: () => game.simpleSoundboard.soundboard.render(true)
  };
});

// Añadir botón en los controles de escena
Hooks.on('getSceneControlButtons', (controls) => {
  const sounds = controls.find(c => c.name === 'sounds');
  if (sounds) {
    sounds.tools.push({
      name: 'simple-soundboard',
      title: game.i18n.localize('SIMPLE-SOUNDBOARD.Title'),
      icon: 'fas fa-th',
      button: true,
      onClick: () => game.simpleSoundboard.open()
    });
  }
});

// Atajos de teclado
Hooks.once('ready', () => {
  game.keybindings.register(MODULE_ID, 'openSoundboard', {
    name: game.i18n.localize('SIMPLE-SOUNDBOARD.Keybinding.Open'),
    hint: game.i18n.localize('SIMPLE-SOUNDBOARD.Keybinding.OpenHint'),
    editable: [{ key: 'KeyS', modifiers: ['Control', 'Shift'] }],
    onDown: () => {
      game.simpleSoundboard.open();
      return true;
    }
  });
});
