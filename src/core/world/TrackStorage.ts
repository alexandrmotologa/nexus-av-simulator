import { EditableTrackData } from './TrackEditor';

const STORAGE_KEY = 'nexus_av_custom_tracks';

export class TrackStorage {
  public static getAllTracks(): EditableTrackData[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) || [];
    } catch {
      return [];
    }
  }

  public static saveTrack(track: EditableTrackData): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const tracks = this.getAllTracks();
      const existingIdx = tracks.findIndex((t) => t.id === track.id);
      if (existingIdx >= 0) {
        tracks[existingIdx] = track;
      } else {
        tracks.push(track);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
    } catch (e) {
      console.error('Failed to save track to localStorage', e);
    }
  }

  public static deleteTrack(trackId: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const tracks = this.getAllTracks().filter((t) => t.id !== trackId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
    } catch (e) {
      console.error('Failed to delete track', e);
    }
  }

  public static exportJSON(track: EditableTrackData): void {
    const json = JSON.stringify(track, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_track_${track.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public static importJSON(jsonString: string): EditableTrackData | null {
    try {
      const data = JSON.parse(jsonString) as EditableTrackData;
      if (data && data.waypoints && data.waypoints.length >= 3) {
        if (!data.id) data.id = `custom-${Date.now()}`;
        if (!data.name) data.name = 'Imported Custom Track';
        this.saveTrack(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to import track JSON', e);
    }
    return null;
  }
}
