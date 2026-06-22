class EnrollmentTracker {
  constructor() {
    this.cache = new Map(); // In-memory only storage
  }

  async get(userId) {
    return this.cache.get(userId);
  }

  async set(userId, userData) {
    // Add timestamp for tracking
    const dataWithTimestamp = {
      ...userData,
      lastUpdated: new Date().toISOString(),
      userId: userId,
    };

    this.cache.set(userId, dataWithTimestamp);
    return dataWithTimestamp;
  }

  async delete(userId) {
    return this.cache.delete(userId);
  }

  async has(userId) {
    return this.cache.has(userId);
  }

  // Cleanup old sessions (older than specified hours)
  cleanup(hoursOld = 24) {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [userId, userData] of this.cache.entries()) {
      const lastUpdated = new Date(userData.lastUpdated || 0);
      if (lastUpdated < cutoffTime) {
        this.cache.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old enrollment sessions`);
    }

    return cleanedCount;
  }

  // Get all active sessions (for admin purposes)
  getAllSessions() {
    return Object.fromEntries(this.cache);
  }

  // Initialize the tracker (call this when bot starts)
  initialize() {
    // Set up periodic cleanup (every hour)
    setInterval(
      () => {
        this.cleanup(24); // Clean sessions older than 24 hours
      },
      60 * 60 * 1000,
    );

    console.log("Enrollment tracker initialized (in-memory only)");
  }

  // Get current session count
  getSessionCount() {
    return this.cache.size;
  }

  // Clear all sessions (useful for testing/maintenance)
  clearAll() {
    const count = this.cache.size;
    this.cache.clear();
    console.log(`Cleared ${count} enrollment sessions`);
    return count;
  }
}

// Create singleton instance
const enrollmentTracker = new EnrollmentTracker();

module.exports = {
  EnrollmentTracker,
  enrollmentTracker,
};
