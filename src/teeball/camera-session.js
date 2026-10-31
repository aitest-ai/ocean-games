// Own the exact asynchronous source: never stop a later session by accident.
export class CameraSession {
  constructor(create, attach, detach) { this.create=create; this.attach=attach; this.detach=detach; this.pending=false; this.source=null; this.generation=0; }
  async start() {
    if(this.pending || this.source) return false;
    const generation=++this.generation, source=this.create();
    this.source=source; this.pending=true;
    try {
      await this.attach(source);
      if(generation!==this.generation){source.stop();return false;}
      return true;
    } catch(error) {
      source.stop();
      if(generation===this.generation){this.source=null;this.detach();throw error;}
      return false;
    } finally { this.pending=false; }
  }
  stop() {
    ++this.generation;
    this.source?.stop(); this.source=null; this.detach();
    // Pending start still owns its source and stops it again when it settles.
  }
}
