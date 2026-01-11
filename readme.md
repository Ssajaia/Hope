Hope.js ⚡
The Enhanced Promise - Everything JavaScript Promises should have been

https://img.shields.io/badge/License-MIT-yellow.svg
https://img.shields.io/badge/Promise%252FA+-compliant-brightgreen.svg

A 100% Promise/A+ compatible implementation with essential features missing in native Promises: timeouts, cancellation, progress tracking, and state introspection.

🚀 Why Hope?
Native Promises are great, but they're missing critical features for production use. Hope gives you everything you love about Promises, plus what you've been wishing for:

javascript
// Features you wish Promises had:
const hope = new Hope((resolve, reject, progress) => {
  progress(25); // ← Native Promises can't do this!
  setTimeout(() => resolve('Done!'), 1000);
});

hope
  .timeout(500, 'Too slow!')    // Automatic timeout
  .progress(p => console.log(p)) // Progress tracking
  .cancel()                      // User cancellation
  .then(console.log)
  .catch(console.error);

// Check state anytime
console.log(hope.state); // 'pending' | 'fulfilled' | 'rejected'
console.log(hope.value); // Only if fulfilled
✨ Key Features
Feature	Native Promise	Hope.js
Timeout Support	❌ Manual hacks	✅ .timeout(ms)
Cancellation	❌ Impossible	✅ Hope.cancellable()
Progress Tracking	❌ Removed in ES6	✅ .progress()
State Introspection	❌ Hidden	✅ .state, .value, .reason
Settlement Hooks	❌ None	✅ .onSettle()
Structured Concurrency	❌ None	✅ Hope.scope()
Promise/A+ Compliant	✅ Yes	✅ 100% Compatible
📦 Installation
bash
npm install @ssajaia/hope
html
<!-- CDN -->
<script src="https://cdn.jsdelivr.net/gh/Ssajaia/Hope@main/dist/hope.min.js"></script>
🎯 Quick Examples
1. Timeout Protection
javascript
import Hope from '@ssajaia/hope';

// No more hanging promises!
const data = await fetch('/api')
  .timeout(5000, 'Request timed out');
2. User Cancellation
javascript
const { hope, cancel } = Hope.cancellable(async (resolve, reject) => {
  const job = await startLongRunningTask();
  return () => job.stop(); // Cleanup function
});

// User cancels when needed
cancelButton.onclick = () => cancel('User canceled');
3. Progress Tracking
javascript
const upload = uploadFile(file);
upload.progress(percent => {
  updateProgressBar(percent);
});
await upload;
4. Structured Concurrency
javascript
// No orphaned async tasks
const result = await Hope.scope(async (scope) => {
  const user = await scope.add(fetchUser());
  const posts = await scope.add(fetchPosts(user.id));
  // If either fails, both cancel automatically
  return { user, posts };
});
🔧 API at a Glance
Drop-in Promise Replacement
javascript
// All Promise methods work
Hope.resolve(value)
Hope.reject(error)
Hope.all([h1, h2, h3])
Hope.race([fast, slow])
new Hope((resolve, reject) => { ... })
Enhanced Methods
javascript
// Timeouts
hope.timeout(ms, reason?)

// Progress
hope.progress(callback)

// Cancellation
Hope.cancellable(executor) // Returns { hope, cancel }

// State inspection
hope.state  // 'pending' | 'fulfilled' | 'rejected'
hope.value  // Only if fulfilled
hope.reason // Only if rejected

// Debugging
hope.onSettle(callback)
hope.stackTrace
Advanced Features
javascript
// Typed validation
const UserHope = Hope.of({ id: Number, name: String });
const user = await UserHope({ id: 1, name: 'John' });

// Configuration
Hope.scheduler = 'microtask' | 'macrotask'  // For testing
Hope.freezeValues = true  // Prevent mutation
Hope.strict = false       // Warn on double settlement
🎮 Real-World Usage
javascript
// File upload with progress & timeout
async function uploadFile(file) {
  const { hope, cancel } = Hope.cancellable((resolve, reject, progress) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = e => progress((e.loaded / e.total) * 100);
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = reject;
    xhr.open('POST', '/upload');
    xhr.send(file);
    return () => xhr.abort();
  });

  return hope.timeout(30000, 'Upload timeout');
}

// Use it
try {
  const result = await uploadFile(file);
  console.log('Success!', result);
} catch (error) {
  if (error.name === 'CancelError') {
    console.log('Upload canceled');
  } else {
    console.error('Upload failed:', error);
  }
}
📚 Compatibility
100% Promise/A+ compliant - Passes all official tests

Works with async/await - Drop-in replacement

Works with Promise.all/race - Mix with native Promises

No polyfills needed - Pure ES6+

🏗️ Architecture
Hope is built in layers:

Tier 0: 100% Promise/A+ compatibility (mandatory)

Tier 1: Essential production features (timeout, cancellation, introspection)

Tier 2: Advanced patterns (progress, structured concurrency)

Tier 3: Experimental (typed validation)

🤝 Contributing
Found a bug? Missing a feature? Contributions welcome!

Fork the repository

Create a feature branch

Add tests for your changes

Submit a pull request

📄 License
GLP3 © Saba Sajaia

