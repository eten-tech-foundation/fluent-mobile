export type Recording = {
    id: string;
    path: string;
    createdAt: number;
  };
  
  class RecordingStore {
    private recordings: Recording[] = [];
  
    add(path: string) {
      const rec = {
        id: Date.now().toString(),
        path,
        createdAt: Date.now(),
      };
      this.recordings.push(rec);
      return rec;
    }
  
    remove(id: string) {
      this.recordings = this.recordings.filter(r => r.id !== id);
    }
  
    getAll() {
      return this.recordings;
    }
  }
  
  export default new RecordingStore();