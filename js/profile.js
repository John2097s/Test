/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  profile.js — Profil System                                  ║
 * ║                                                              ║
 * ║  Enthält: Username bearbeiten, Avatar hochladen              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const Profile = {

  /**
   * Name-Edit-Modus umschalten.
   * Zeigt/versteckt das Eingabefeld.
   */
  toggleNameEdit() {
    const nameEl  = document.getElementById('ph-name');
    const editEl  = document.getElementById('ph-name-edit');
    const inputEl = document.getElementById('name-input');
    const btnEl   = document.getElementById('edit-name-btn');

    const isEditing = editEl.style.display !== 'none';

    if (isEditing) {
      // Edit abbrechen
      nameEl.style.display  = 'inline';
      editEl.style.display  = 'none';
      btnEl.textContent = '✏️';
    } else {
      // Edit starten
      inputEl.value = state.username;
      nameEl.style.display  = 'none';
      editEl.style.display  = 'flex';
      inputEl.focus();
      inputEl.select();
      btnEl.textContent = '✕';
    }
  },

  /**
   * Neuen Namen speichern.
   * Aufgerufen beim Klick auf "OK" oder Enter im Eingabefeld.
   */
  saveName() {
    const inputEl = document.getElementById('name-input');
    const newName = inputEl.value.trim();

    if (!newName) {
      Render.toast('Name darf nicht leer sein!', 'danger');
      return;
    }
    if (newName.length > 20) {
      Render.toast('Name maximal 20 Zeichen!', 'danger');
      return;
    }

    state.username = newName.toUpperCase();
    saveState();

    // Edit-Modus schließen
    document.getElementById('ph-name').style.display  = 'inline';
    document.getElementById('ph-name-edit').style.display = 'none';
    document.getElementById('edit-name-btn').textContent = '✏️';

    Render.updateProfile();
    Render.toast(`Willkommen, ${state.username}!`, '');
  },

  /**
   * Avatar-Upload initialisieren.
   * Setzt Event-Listener auf den versteckten File-Input.
   */
  initAvatarUpload() {
    const uploadInput = document.getElementById('avatar-upload');
    const editBtn     = document.getElementById('avatar-edit-btn');

    // Edit-Button öffnet den File-Picker
    editBtn.addEventListener('click', () => uploadInput.click());

    // Bild ausgewählt → als Base64 speichern
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Nur Bilder erlauben
      if (!file.type.startsWith('image/')) {
        Render.toast('Nur Bilddateien erlaubt!', 'danger');
        return;
      }

      // Max 2MB (Base64 ist ~33% größer)
      if (file.size > 2 * 1024 * 1024) {
        Render.toast('Bild zu groß! Maximal 2MB.', 'danger');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        state.avatarData = ev.target.result;
        saveState();
        Render.updateProfile();
        Render.toast('Profilbild aktualisiert!', '');
      };
      reader.readAsDataURL(file);

      // Input zurücksetzen (damit dasselbe Bild nochmal gewählt werden kann)
      uploadInput.value = '';
    });
  },

  /**
   * Name-Input auf Enter-Taste reagieren.
   */
  initNameInput() {
    const inputEl = document.getElementById('name-input');
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveName();
      if (e.key === 'Escape') this.toggleNameEdit();
    });

    document.getElementById('edit-name-btn').addEventListener('click', () => {
      this.toggleNameEdit();
    });
  },
};
