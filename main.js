const { Scheduler } = require('./scheduler');
const Hope = require('./Hope');

console.log('🚀 ASYNC JOB SCHEDULER DEMONSTRATION\n');

// Colorful console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ========== DEMONSTRATION TASKS ==========

// Task 1: Simple task with progress
function createDownloadTask(id, sizeMB, speedMBps) {
  return () => {
    const totalChunks = 10;
    let currentChunk = 0;
    
    return new Hope((resolve, reject, progress) => {
      log('cyan', `📥 Download ${id}: Starting download of ${sizeMB}MB...`);
      
      const simulateChunk = () => {
        if (currentChunk >= totalChunks) {
          log('green', `✅ Download ${id}: Complete!`);
          resolve({ id, sizeMB, downloaded: sizeMB });
          return;
        }
        
        currentChunk++;
        const percent = (currentChunk / totalChunks) * 100;
        progress(percent);
        
        log('blue', `   Download ${id}: ${percent.toFixed(0)}% (${(sizeMB * currentChunk / totalChunks).toFixed(1)}MB)`);
        
        // Simulate network speed
        const chunkTime = (sizeMB / totalChunks / speedMBps) * 1000;
        setTimeout(simulateChunk, chunkTime);
      };
      
      simulateChunk();
    });
  };
}

// Task 2: Processing task that can fail
function createProcessTask(id, complexity, failChance = 0) {
  return () => {
    log('yellow', `⚙️  Process ${id}: Starting processing (complexity: ${complexity})...`);
    
    return new Hope((resolve, reject, progress) => {
      let step = 0;
      const totalSteps = 5;
      
      const processStep = () => {
        step++;
        progress((step / totalSteps) * 100);
        
        // Random failure
        if (Math.random() < failChance) {
          log('red', `❌ Process ${id}: Failed at step ${step}/${totalSteps}`);
          reject(new Error(`Processing failed for ${id} at step ${step}`));
          return;
        }
        
        log('yellow', `   Process ${id}: Step ${step}/${totalSteps} complete`);
        
        if (step >= totalSteps) {
          const result = { id, complexity, processed: true };
          log('green', `✅ Process ${id}: Processing complete!`);
          resolve(result);
        } else {
          // Simulate work based on complexity
          setTimeout(processStep, complexity * 100);
        }
      };
      
      processStep();
    });
  };
}

// Task 3: Validation task
function createValidationTask(id, data) {
  return () => {
    log('magenta', `🔍 Validate ${id}: Starting validation...`);
    
    return new Hope((resolve, reject, progress) => {
      setTimeout(() => {
        progress(30);
        log('magenta', `   Validate ${id}: Checking format...`);
        
        setTimeout(() => {
          progress(60);
          log('magenta', `   Validate ${id}: Verifying integrity...`);
          
          setTimeout(() => {
            progress(90);
            log('magenta', `   Validate ${id}: Final checks...`);
            
            setTimeout(() => {
              // Random validation result
              const isValid = Math.random() > 0.2; // 80% valid
              
              if (isValid) {
                log('green', `✅ Validate ${id}: Data is valid`);
                resolve({ id, data, valid: true });
              } else {
                log('red', `❌ Validate ${id}: Data validation failed`);
                reject(new Error(`Validation failed for ${id}`));
              }
            }, 200);
          }, 300);
        }, 400);
      }, 100);
    });
  };
}

// Task 4: Timeout test task
function createSlowTask(id, delay) {
  return () => {
    log('white', `🐌 Slow ${id}: This will take ${delay}ms...`);
    
    return new Hope((resolve) => {
      setTimeout(() => {
        log('green', `✅ Slow ${id}: Finally done!`);
        resolve({ id, delay, completed: true });
      }, delay);
    });
  };
}

// ========== MAIN DEMONSTRATION ==========

async function demonstrateScheduler() {
  log('green', '\n📋 DEMO 1: Basic Scheduler with Concurrency\n');
  
  // Create scheduler with concurrency 3
  const scheduler = new Scheduler({
    concurrency: 3,
    autoStart: true
  });
  
  log('cyan', `Created scheduler with concurrency: ${scheduler.options.concurrency}`);
  
  // Add some download tasks
  scheduler.add(createDownloadTask('File1', 100, 10), { priority: 1 });
  scheduler.add(createDownloadTask('File2', 50, 5), { priority: 2 });
  scheduler.add(createDownloadTask('File3', 200, 20), { priority: 3 });
  scheduler.add(createDownloadTask('File4', 75, 15), { priority: 4 });
  
  log('yellow', 'Added 4 download tasks (only 3 will run concurrently)');
  
  // Wait for downloads to complete
  await scheduler.onIdle();
  log('green', '✓ All downloads completed!');
  
  // Show statistics
  const status1 = scheduler.getStatus();
  log('cyan', `\nStatistics after downloads:`);
  log('white', `  Total jobs: ${status1.stats.totalJobs}`);
  log('white', `  Completed: ${status1.stats.completedJobs}`);
  log('white', `  Average time: ${status1.stats.avgTime.toFixed(0)}ms`);
  
  log('green', '\n\n📋 DEMO 2: Timeouts and Retries\n');
  
  // Create new scheduler for timeout demo
  const scheduler2 = new Scheduler({
    concurrency: 2,
    autoStart: true
  });
  
  // Add a task that will timeout
  scheduler2.add(
    createSlowTask('TimeoutTest', 2000),
    { 
      timeout: 1000,
      retries: 1,
      retryDelay: 500
    }
  );
  
  // Add a normal task
  scheduler2.add(createProcessTask('NormalTask', 2), { priority: 5 });
  
  // Add a task that might fail
  scheduler2.add(
    createProcessTask('RetryTask', 3, 0.3), // 30% chance of failure
    { retries: 2, retryDelay: 300 }
  );
  
  try {
    await scheduler2.onIdle();
    log('green', '✓ Timeout/retry demo completed');
  } catch (error) {
    log('red', `⚠️ Some tasks failed: ${error.message}`);
  }
  
  const status2 = scheduler2.getStatus();
  log('cyan', `\nStatistics after timeout/retry demo:`);
  log('white', `  Completed: ${status2.stats.completedJobs}`);
  log('white', `  Failed: ${status2.stats.failedJobs}`);
  
  log('green', '\n\n📋 DEMO 3: Job Monitoring and Control\n');
  
  const scheduler3 = new Scheduler({
    concurrency: 2,
    autoStart: false // Manual start
  });
  
  log('yellow', 'Scheduler created but not started (autoStart: false)');
  
  // Add jobs
  const job1 = scheduler3.add(createDownloadTask('Monitor1', 50, 5));
  const job2 = scheduler3.add(createDownloadTask('Monitor2', 30, 3));
  const job3 = scheduler3.add(createDownloadTask('Monitor3', 80, 8));
  
  log('cyan', `Added 3 jobs with IDs: ${job1}, ${job2}, ${job3}`);
  
  // Monitor job progress
  const monitorJob = scheduler3.getJob(job1);
  if (monitorJob) {
    monitorJob._hope.progress(p => {
      log('blue', `   Job ${job1} progress: ${p.toFixed(0)}%`);
    });
  }
  
  // Start scheduler
  log('yellow', 'Starting scheduler...');
  scheduler3.start();
  
  // Cancel a job after 500ms
  setTimeout(() => {
    log('red', `Attempting to cancel job ${job2}...`);
    const canceled = scheduler3.cancelJob(job2);
    if (canceled) {
      log('red', `✓ Job ${job2} canceled successfully`);
    }
  }, 500);
  
  // Wait for specific job
  try {
    log('cyan', `Waiting for job ${job1} to complete...`);
    const result = await scheduler3.waitForJob(job1);
    log('green', `✓ Job ${job1} result:`, JSON.stringify(result));
  } catch (error) {
    log('red', `✗ Error waiting for job ${job1}: ${error.message}`);
  }
  
  // Wait for all to complete
  await scheduler3.onIdle();
  log('green', '✓ All monitoring demo jobs completed');
  
  log('green', '\n\n📋 DEMO 4: Priority Queue\n');
  
  const scheduler4 = new Scheduler({
    concurrency: 1, // Run one at a time to see order clearly
    autoStart: true
  });
  
  const executionOrder = [];
  
  // Add tasks with different priorities
  scheduler4.add(
    () => {
      executionOrder.push('LowPriority');
      return Hope.resolve('Low');
    },
    { priority: 1 }
  );
  
  scheduler4.add(
    () => {
      executionOrder.push('HighPriority');
      return Hope.resolve('High');
    },
    { priority: 10 }
  );
  
  scheduler4.add(
    () => {
      executionOrder.push('MediumPriority');
      return Hope.resolve('Medium');
    },
    { priority: 5 }
  );
  
  scheduler4.add(
    () => {
      executionOrder.push('HighestPriority');
      return Hope.resolve('Highest');
    },
    { priority: 100 }
  );
  
  await scheduler4.onIdle();
  
  log('cyan', '\nExecution order by priority:');
  executionOrder.forEach((task, index) => {
    log('white', `  ${index + 1}. ${task}`);
  });
  
  // Verify high priority ran first
  if (executionOrder[0] !== 'HighestPriority') {
    log('red', '✗ Priority scheduling failed!');
  } else {
    log('green', '✓ Priority scheduling working correctly');
  }
  
  log('green', '\n\n📋 DEMO 5: Chainable API and Complex Workflow\n');
  
  const workflowScheduler = new Scheduler({
    concurrency: 2,
    autoStart: true
  });
  
  // Create a workflow using chainable API
  workflowScheduler
    .chain(() => {
      log('cyan', '🔗 Workflow Step 1: Downloading data...');
      return createDownloadTask('WorkflowData', 150, 15)();
    })
    .chain(() => {
      log('cyan', '🔗 Workflow Step 2: Processing data...');
      return createProcessTask('WorkflowProcess', 4, 0.1)();
    }, { retries: 1 })
    .chain(() => {
      log('cyan', '🔗 Workflow Step 3: Validating results...');
      return createValidationTask('WorkflowValidate', { sample: 'data' })();
    })
    .chain(() => {
      log('cyan', '🔗 Workflow Step 4: Finalizing...');
      return Hope.resolve({ workflow: 'complete', status: 'success' });
    });
  
  try {
    await workflowScheduler.onIdle();
    log('green', '✓ Complete workflow executed successfully!');
  } catch (error) {
    log('red', `✗ Workflow failed: ${error.message}`);
  }
  
  log('green', '\n\n📋 DEMO 6: Cancel All and Emergency Stop\n');
  
  const emergencyScheduler = new Scheduler({
    concurrency: 3,
    autoStart: true
  });
  
  // Add many jobs
  for (let i = 1; i <= 5; i++) {
    emergencyScheduler.add(
      createSlowTask(`Emergency${i}`, 3000),
      { timeout: 5000 }
    );
  }
  
  log('yellow', 'Started 5 long-running tasks...');
  
  // Emergency stop after 1 second
  setTimeout(async () => {
    log('red', '\n🚨 EMERGENCY: Canceling all jobs!');
    const canceled = emergencyScheduler.cancelAll();
    
    log('red', `Canceled ${canceled.length} jobs: ${canceled.join(', ')}`);
    
    // Try to add more jobs after cancel (should fail if scheduler stopped)
    try {
      emergencyScheduler.add(() => Hope.resolve('After cancel'));
      log('yellow', 'Scheduler still accepts new jobs after cancelAll');
    } catch (error) {
      log('red', `Cannot add new jobs: ${error.message}`);
    }
    
    await emergencyScheduler.onIdle();
    log('green', 'Emergency shutdown complete');
  }, 1000);
  
  // Wait a bit for emergency procedure
  await new Hope(resolve => setTimeout(resolve, 1500));
  
  log('green', '\n\n📋 FINAL SUMMARY\n');
  
  // Combine all scheduler stats
  const allSchedulers = [scheduler, scheduler2, scheduler3, scheduler4, workflowScheduler, emergencyScheduler];
  let totalJobs = 0;
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalCanceled = 0;
  
  allSchedulers.forEach((sched, i) => {
    const stats = sched.getStatus().stats;
    totalJobs += stats.totalJobs;
    totalCompleted += stats.completedJobs;
    totalFailed += stats.failedJobs;
    totalCanceled += stats.canceledJobs;
  });
  
  log('cyan', '=== Overall Statistics ===');
  log('white', `Total jobs created: ${totalJobs}`);
  log('green', `Successfully completed: ${totalCompleted}`);
  log('yellow', `Failed: ${totalFailed}`);
  log('red', `Canceled: ${totalCanceled}`);
  log('white', `Success rate: ${((totalCompleted / totalJobs) * 100).toFixed(1)}%`);
  
  log('green', '\n🎉 DEMONSTRATION COMPLETE!');
  log('cyan', 'The Hope-based scheduler successfully demonstrated:');
  log('white', '  • Concurrency limiting');
  log('white', '  • Priority scheduling');
  log('white', '  • Timeouts and retries');
  log('white', '  • Job monitoring and control');
  log('white', '  • Progress tracking');
  log('white', '  • Error propagation');
  log('white', '  • Chainable workflows');
  log('white', '  • Emergency cancellation');
  
  log('green', '\n✨ All Hope Promise semantics validated!');
}

// Run the demonstration
demonstrateScheduler().catch(error => {
  log('red', `❌ Demonstration failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});