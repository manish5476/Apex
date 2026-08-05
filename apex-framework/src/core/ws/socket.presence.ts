class PresenceManager {
    private activeSockets = new Map<string, Set<string>>();
    private orgOnlineUsers = new Map<string, Set<string>>();
    private channelPresence = new Map<string, Set<string>>();
  
    private _setAdd(map: Map<string, Set<string>>, key: string, value: string): void {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(value);
    }
  
    private _setRemove(map: Map<string, Set<string>>, key: string, value: string): void {
      const set = map.get(key);
      if (!set) return;
      set.delete(value);
      if (set.size === 0) map.delete(key);
    }
  
    private _setValues(map: Map<string, Set<string>>, key: string): string[] {
      const set = map.get(key);
      return set ? Array.from(set) : [];
    }
  
    addSocketForUser(userId: string, socketId: string) { this._setAdd(this.activeSockets, userId, socketId); }
    removeSocketForUser(userId: string, socketId: string) { this._setRemove(this.activeSockets, userId, socketId); }
    getSocketIdsForUser(userId: string) { return this._setValues(this.activeSockets, userId); }
  
    addOrgOnlineUser(orgId: string, userId: string) { this._setAdd(this.orgOnlineUsers, orgId, userId); }
    removeOrgOnlineUser(orgId: string, userId: string) { this._setRemove(this.orgOnlineUsers, orgId, userId); }
    getOnlineUsersInOrg(orgId: string) { return this._setValues(this.orgOnlineUsers, orgId); }
  
    addUserToChannel(channelId: string, userId: string) { this._setAdd(this.channelPresence, channelId, userId); }
    removeUserFromChannel(channelId: string, userId: string) { this._setRemove(this.channelPresence, channelId, userId); }
    getUsersInChannel(channelId: string) { return this._setValues(this.channelPresence, channelId); }
  
    getUserOnlineStatus(userId: string) { return this.activeSockets.has(userId); }
    getOnlineUsers() { return Array.from(this.activeSockets.keys()); }
    
    getTotalConnections() { 
      return Array.from(this.activeSockets.values()).reduce((acc, set) => acc + set.size, 0); 
    }
    
    getActiveChannelsCount() { return this.channelPresence.size; }
  }
  
  export const presence = new PresenceManager();