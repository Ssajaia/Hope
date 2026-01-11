const Hope = require('./hope');

class SchedulerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchedulerError';
  }
}

class JobTimeoutError extends Error {
  constructor(jobId, timeout) {
    super(`Job ${jobId} timed out after ${timeout}ms`);
    this.name = 'JobTimeoutError';
    this.jobId = jobId;
    this.timeout = timeout;
  }
}

class JobCanceledError extends Error {
  constructor(jobId) {
    super(`Job ${jobId} was canceled`);
    this.name = 'JobCanceledError';
    this.jobId = jobId;
  }
}

class Job {
  constructor(id, taskFn, options = {}) {
    this.id = id;
    this.taskFn = taskFn;
    this.options = {
      timeout: options.timeout || 0, 
      retries: options.retries || 0,
      retryDelay: options.retryDelay || 1000,
      priority: options.priority || 0, 
      ...options
    };
    
    this.state = 'pending'; // 'pending', 'running', 'completed', 'failed', 'canceled'
    this.result = null;
    this.error = null;
    this.attempts = 0;
    this.progress = 0;
    this.startTime = null;
    this.endTime = null;
    
    this._hope = null;
    this._cancel = null;
    this._timeoutTimer = null;
  }

  run() {
    if (this.state !== 'pending') {
      return Hope.reject(new Error(`Job ${this.id} is not pending`));
    }

    this.state = 'running';
    this.startTime = Date.now();
    this.attempts++;
    
    const { hope, cancel } = Hope.cancellable((resolve, reject, progress) => {
      const task = this.taskFn();
      if (!(task instanceof Hope)) {
        reject(new TypeError('Task must return a Hope instance'));
        return;
      }
      
      task.progress(p => {
        this.progress = p;
        progress(p);
      });
      
      task.then(
        result => {
          this.result = result;
          this.state = 'completed';
          this.endTime = Date.now();
          resolve(result);
        },
        error => {
          this.error = error;
          this.state = 'failed';
          this.endTime = Date.now();
          reject(error);
        }
      );
    });
    
    this._hope = hope;
    this._cancel = cancel;
    
    if (this.options.timeout > 0) {
      this._hope = this._hope.timeout(
        this.options.timeout,
        `Job ${this.id} timed out after ${this.options.timeout}ms`
      );
    }
    
    return this._hope;
  }

  cancel() {
    if (this.state === 'running' && this._cancel) {
      this.state = 'canceled';
      this.endTime = Date.now();
      this._cancel();
      return true;
    } else if (this.state === 'pending') {
      this.state = 'canceled';
      return true;
    }
    return false;
  }

  getDuration() {
    if (!this.startTime) return 0;
    if (!this.endTime) return Date.now() - this.startTime;
    return this.endTime - this.startTime;
  }
}

class Scheduler {
  constructor(options = {}) {
    this.options = {
      concurrency: options.concurrency || 1,
      maxQueueSize: options.maxQueueSize || Infinity,
      autoStart: options.autoStart !== false,
      ...options
    };
    
    this.jobs = new Map(); // id -> Job
    this.pendingJobs = []; // Jobs waiting to run
    this.runningJobs = new Set(); // Currently running job IDs
    this.completedJobs = []; // Completed job history
    
    this._nextJobId = 1;
    this._isRunning = false;
    this._idleHope = null;
    this._idleResolve = null;
    
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      canceledJobs: 0,
      totalTime: 0,
      avgTime: 0
    };
    
    if (this.options.autoStart) {
      this.start();
    }
  }

  add(taskFn, options = {}) {
    if (this.pendingJobs.length >= this.options.maxQueueSize) {
      throw new SchedulerError('Queue is full');
    }
    
    const id = `job-${this._nextJobId++}`;
    const job = new Job(id, taskFn, options);
    
    this.jobs.set(id, job);
    this.pendingJobs.push(job);
    this.stats.totalJobs++;
    
    this.pendingJobs.sort((a, b) => b.options.priority - a.options.priority);
    
    if (this._isRunning) {
      this._processQueue();
    }
    
    return id;
  }

  start() {
    if (this._isRunning) return;
    
    this._isRunning = true;
    this._processQueue();
  }

  stop() {
    this._isRunning = false;
    
    for (const job of this.pendingJobs) {
      job.cancel();
    }
    this.pendingJobs = [];
    
    for (const jobId of this.runningJobs) {
      const job = this.jobs.get(jobId);
      if (job) job.cancel();
    }
  }

  async waitForJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new SchedulerError(`Job ${jobId} not found`);
    }
    
    if (['completed', 'failed', 'canceled'].includes(job.state)) {
      if (job.state === 'completed') return job.result;
      throw job.error || new Error(`Job ${jobId} ${job.state}`);
    }
    
    return job._hope;
  }

  onIdle() {
    if (!this._idleHope) {
      this._idleHope = new Hope(resolve => {
        this._idleResolve = resolve;
        if (this.runningJobs.size === 0 && this.pendingJobs.length === 0) {
          resolve();
        }
      });
    }
    return this._idleHope;
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    const canceled = job.cancel();
    
    if (canceled) {
      const pendingIndex = this.pendingJobs.findIndex(j => j.id === jobId);
      if (pendingIndex !== -1) {
        this.pendingJobs.splice(pendingIndex, 1);
      }
      
      this.runningJobs.delete(jobId);
      
      this.stats.canceledJobs++;
      this._checkIdle();
    }
    
    return canceled;
  }

  cancelAll() {
    const canceledIds = [];
    
    for (const job of this.pendingJobs) {
      if (job.cancel()) {
        canceledIds.push(job.id);
        this.stats.canceledJobs++;
      }
    }
    this.pendingJobs = [];
    
    for (const jobId of this.runningJobs) {
      const job = this.jobs.get(jobId);
      if (job && job.cancel()) {
        canceledIds.push(jobId);
        this.stats.canceledJobs++;
      }
    }
    this.runningJobs.clear();
    
    this._checkIdle();
    return canceledIds;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  getStatus() {
    return {
      isRunning: this._isRunning,
      pending: this.pendingJobs.length,
      running: this.runningJobs.size,
      completed: this.completedJobs.length,
      stats: { ...this.stats }
    };
  }

  _processQueue() {
    if (!this._isRunning) return;
    
    while (this.runningJobs.size < this.options.concurrency && this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift();
      this.runningJobs.add(job.id);
      
      this._runJob(job);
    }
    
    if (this.runningJobs.size === 0 && this.pendingJobs.length === 0) {
      this._checkIdle();
    }
  }

  _runJob(job) {
    job.run().then(
      result => {
        this._jobCompleted(job.id, result);
      },
      error => {
        this._jobFailed(job.id, error);
      }
    );
  }

  _jobCompleted(jobId, result) {
    this.runningJobs.delete(jobId);
    
    const job = this.jobs.get(jobId);
    if (job) {
      job.result = result;
      job.state = 'completed';
      job.endTime = Date.now();
      
      this.completedJobs.push(job);
      this.stats.completedJobs++;
      
      const duration = job.getDuration();
      this.stats.totalTime += duration;
      this.stats.avgTime = this.stats.totalTime / this.stats.completedJobs;
    }
    
    this._processQueue();
  }

  _jobFailed(jobId, error) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    if (job.attempts <= job.options.retries && !(error instanceof JobTimeoutError)) {
      job.state = 'pending';
      job.error = null;
      
      setTimeout(() => {
        this.pendingJobs.push(job);
        this.pendingJobs.sort((a, b) => b.options.priority - a.options.priority);
        this._processQueue();
      }, job.options.retryDelay);
    } else {
      job.state = 'failed';
      job.error = error;
      job.endTime = Date.now();
      
      this.runningJobs.delete(jobId);
      this.completedJobs.push(job);
      this.stats.failedJobs++;
      
      this._processQueue();
    }
  }

  _checkIdle() {
    if (this.runningJobs.size === 0 && this.pendingJobs.length === 0 && this._idleResolve) {
      this._idleResolve();
      this._idleHope = null;
      this._idleResolve = null;
    }
  }
}

Scheduler.create = (options) => new Scheduler(options);

Scheduler.prototype.chain = function(taskFn, options) {
  this.add(taskFn, options);
  return this;
};

module.exports = {
  Scheduler,
  SchedulerError,
  JobTimeoutError,
  JobCanceledError
};  