import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-lead-note-modal',
  templateUrl: './lead-note-modal.component.html',
  styleUrls: ['./lead-note-modal.component.css']
})
export class LeadNoteModalComponent implements OnInit {
  @Input() scan: any;
  @Input() note: string;

  interestLevel: string = '';
  freeformNote: string = '';
  readonly maxNoteLength = 4000;
  followUpActions = [
    { label: 'Send info', emoji: '📧', checked: false },
    { label: 'Demo', emoji: '🎯', checked: false },
    { label: 'Newsletter', emoji: '📰', checked: false },
    { label: 'Hiring', emoji: '💼', checked: false },
    { label: 'Partner', emoji: '🤝', checked: false },
  ];

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    this.parseNote(this.note || '');
  }

  cancel() {
    return this.modalCtrl.dismiss({ note: null }, 'cancel');
  }

  confirm() {
    const composed = this.composeNote();
    this.modalCtrl.dismiss({ note: composed }, 'save');
  }

  /** Parse an existing note back into structured fields */
  private parseNote(raw: string) {
    if (!raw) return;

    // Try to parse structured format
    const interestMatch = raw.match(/Interest: (hot|warm|cold)/i);
    if (interestMatch) {
      this.interestLevel = interestMatch[1].toLowerCase();
    }

    const followUpMatch = raw.match(/Follow-up: (.+)/i);
    if (followUpMatch) {
      const actions = followUpMatch[1].split(', ').map(a => a.trim().toLowerCase());
      this.followUpActions.forEach(a => {
        a.checked = actions.includes(a.label.toLowerCase());
      });
    }

    // Notes section is always last, so capture everything after "Notes: " to end of string.
    // Previously used /m which made $ stop at the first newline, silently dropping subsequent lines.
    const notesMatch = raw.match(/Notes: ([\s\S]*)$/);
    if (notesMatch) {
      this.freeformNote = notesMatch[1].trim();
    } else if (!interestMatch && !followUpMatch) {
      // Legacy plain text note — put it all in freeform
      this.freeformNote = raw;
    }
  }

  /** Compose structured fields into a single note string */
  private composeNote(): string {
    const parts: string[] = [];

    if (this.interestLevel) {
      parts.push(`Interest: ${this.interestLevel}`);
    }

    const selectedActions = this.followUpActions.filter(a => a.checked).map(a => a.label);
    if (selectedActions.length > 0) {
      parts.push(`Follow-up: ${selectedActions.join(', ')}`);
    }

    if (this.freeformNote?.trim()) {
      parts.push(`Notes: ${this.freeformNote.trim()}`);
    }

    return parts.join('\n');
  }
}
