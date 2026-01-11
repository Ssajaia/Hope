
class CancelError extends Error {
  constructor(message = 'Operation canceled') {
    super(message);
    this.name = 'CancelError';
    Object.setPrototypeOf(this, CancelError.prototype);
  }
}


class AggregateError extends Error {
  constructor(errors, message = 'All promises were rejected') {
    super(message);
    this.name = 'AggregateError';
    this.errors = errors;
    Object.setPrototypeOf(this, AggregateError.prototype);
  }
}
class Hope {
  static PENDING = 'pending';
  static FULFILLED = 'fulfilled';
  static REJECTED = 'rejected';

  // ========== STATIC CONFIGURATION ==========
  static scheduler = 'microtask'; // 'microtask' | 'macrotask' | custom
  static freezeValues = false;    // Deep freeze resolved values
  static strict = false;          // Throw on double settlement
  
  // ========== CONSTRUCTOR ==========

  constructor(executor) {
    this._state = Hope.PENDING;
    this._value = undefined;
    this._reason = undefined;
    this._onFulfilledCallbacks = [];
    this._onRejectedCallbacks = [];
    this._settled = false;
    this._creationStack = new Error('Hope created').stack;
    this._onSettleCallbacks = [];
    this._timeoutId = null;
    this._isCancelable = false;
    this._progressCallbacks = [];
    this._pendingProgressValues = [];
    
    // ========== EXECUTE CONSTRUCTOR ==========
    try {
      executor(
        value => this._resolve(value),
        reason => this._reject(reason),
        progress => this._progress(progress)
      );
    } catch (error) {
      this._reject(error);
    }
  }
  then(onFulfilled, onRejected) {
    return new Hope((resolve, reject) => {
      const handleSettlement = () => {
        const scheduleTask = () => {
          try {
            const handler = this._state === Hope.FULFILLED 
              ? (typeof onFulfilled === 'function' ? onFulfilled : null)
              : (typeof onRejected === 'function' ? onRejected : null);
            if (!handler) {
              this._state === Hope.FULFILLED ? resolve(this._value) : reject(this._reason);
              return;
            }
            const result = handler(this._state === Hope.FULFILLED ? this._value : this._reason);
            this._resolvePromise(resolve, reject, result);
          } catch (error) {
            reject(error);
          }
        };
        switch (Hope.scheduler) {
          case 'microtask':
            queueMicrotask(scheduleTask);
            break;
          case 'macrotask':
            setTimeout(scheduleTask, 0);
            break;
          default:
            if (typeof Hope.scheduler === 'function') {
              Hope.scheduler(scheduleTask);
            } else {
              queueMicrotask(scheduleTask);
            }
        }
      };
      if (this._state === Hope.PENDING) {
        this._onFulfilledCallbacks.push(() => handleSettlement());
        this._onRejectedCallbacks.push(() => handleSettlement());
      } else {
        handleSettlement();
      }
    });
  }
  catch(onRejected) {
    return this.then(null, onRejected);
  }
  finally(onFinally) {
    return this.then(
      value => Hope.resolve(
        typeof onFinally === 'function' ? onFinally() : onFinally
      ).then(() => value),
      reason => Hope.resolve(
        typeof onFinally === 'function' ? onFinally() : onFinally
      ).then(() => { throw reason; })
    );
  }
  get state() {
    return this._state;
  }
  get value() {
    if (this._state !== Hope.FULFILLED) {
      throw new Error('Cannot get value from non-fulfilled Hope');
    }
    return this._value;
}
  get reason() {
    if (this._state !== Hope.REJECTED) {
      throw new Error('Cannot get reason from non-rejected Hope');
    }
    return this._reason;
  }
  onSettle(callback) {
    if (this._state !== Hope.PENDING) {
      try {
        callback(
          this._state,
          this._state === Hope.FULFILLED ? this._value : this._reason
        );
      } catch (error) {
        console.error('onSettle callback error:', error);
      }
    } else {
      this._onSettleCallbacks.push(callback);
    }
    return this;
  }
  timeout(ms, reason = 'Operation timeout') {
    return new Hope((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(typeof reason === 'string' ? new Error(reason) : reason);
      }, ms);
      this.then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
  get stackTrace() {
    if (this._state === Hope.REJECTED) {
      const settlementStack = this._reason instanceof Error 
        ? this._reason.stack 
        : 'No stack';
      return `Creation stack:\n${this._creationStack}\n\nSettlement stack:\n${settlementStack}`;
    }
    return `Creation stack:\n${this._creationStack}`;
  }
  progress(callback) {
    if (this._state === Hope.PENDING) {
      for (const value of this._pendingProgressValues) {
        try {
          callback(value);
        } catch (error) {
          console.error('Progress callback error:', error);
        }
      }
      this._progressCallbacks.push(callback);
    }
    return this;
  }
  cancel(reason = 'Canceled') {
    if (this._isCancelable && this._state === Hope.PENDING) {
      this._reject(new CancelError(reason));
      return true;
    }
    return false;
  }
  static resolve(value) {
    if (value instanceof Hope) {
      return value;
    }
    if (value && typeof value.then === 'function') {
      return new Hope((resolve, reject) => {
        value.then(resolve, reject);
      });
    }
    
    return new Hope(resolve => {
      if (Hope.freezeValues && value !== null && typeof value === 'object') {
        this._deepFreeze(value);
      }
      resolve(value);
    });
  }
  static reject(reason) {
    return new Hope((_, reject) => reject(reason));
  }
  static all(iterable) {
    return new Hope((resolve, reject) => {
      const items = Array.from(iterable);
      const results = new Array(items.length);
      let pending = items.length;
      
      if (pending === 0) {
        resolve([]);
        return;
      }
      
      items.forEach((item, index) => {
        Hope.resolve(item).then(
          value => {
            results[index] = value;
            pending--;
            if (pending === 0) {
              resolve(results);
            }
          },
          reject
        );
      });
    });
  }
  static race(iterable) {
    return new Hope((resolve, reject) => {
      const items = Array.from(iterable);
      
      if (items.length === 0) {return;}
      
      items.forEach(item => {
        Hope.resolve(item).then(resolve, reject);
      });
    });
  }
  static allSettled(iterable) {
    return new Hope(resolve => {
      const items = Array.from(iterable);
      const results = new Array(items.length);
      let pending = items.length;
      
      if (pending === 0) {
        resolve([]);
        return;
      }
      
      const settle = (index, status, valueOrReason) => {
        results[index] = {
          status,
          [status === 'fulfilled' ? 'value' : 'reason']: valueOrReason
        };
        pending--;
        if (pending === 0) {
          resolve(results);
        }
      };
      
      items.forEach((item, index) => {
        Hope.resolve(item).then(
          value => settle(index, 'fulfilled', value),
          reason => settle(index, 'rejected', reason)
        );
      });
    });
  }
  static any(iterable) {
    return new Hope((resolve, reject) => {
      const items = Array.from(iterable);
      const errors = new Array(items.length);
      let rejected = 0;
      
      if (items.length === 0) {
        reject(new AggregateError([], 'All promises were rejected'));
        return;
      }
      
      items.forEach((item, index) => {
        Hope.resolve(item).then(
          resolve,
          reason => {
            errors[index] = reason;
            rejected++;
            if (rejected === items.length) {
              reject(new AggregateError(errors, 'All promises were rejected'));
            }
          }
        );
      });
    });
  }
  static cancellable(executor) {
    let cancelFunction = null;
    
    const hope = new Hope((resolve, reject, progress) => {
      cancelFunction = (reason = 'Canceled') => {
        reject(new CancelError(reason));
      };
      executor(resolve, reject, progress);
    });
    
    hope._isCancelable = true;
    
    return {
      hope,
      cancel: cancelFunction
    };
  }
  static withTimeout(promise, ms, reason = 'Timeout') {
    return Hope.resolve(promise).timeout(ms, reason);
  }
  static scope(task) {
    return new Hope(async (resolve, reject) => {
      const children = [];
      let scopeRejected = false;
      let scopeReason = null;
      let taskCompleted = false;
      
      const scope = {
        add(promiseOrFunction) {
          if (scopeRejected) {
            // Don't allow new tasks after scope failure
            return Hope.reject(new Error('Scope already failed'));
          }
          
          if (taskCompleted) {
            // Don't allow new tasks after task function returns
            return Hope.reject(new Error('Scope task already completed'));
          }
          
          // Get promise (either directly or from function)
          const promise = typeof promiseOrFunction === 'function'
            ? promiseOrFunction()
            : promiseOrFunction;
          
          const hope = Hope.resolve(promise);
          children.push(hope);
          
          // If child fails, fail the entire scope
          hope.catch(error => {
            if (!scopeRejected) {
              scopeRejected = true;
              scopeReason = error;
              
              // Cancel all other children
              children.forEach(child => {
                if (child !== hope && child.state === 'pending') {
                  child.catch(() => {}); // Prevent unhandled rejection
                  if (child.cancel) child.cancel();
                }
              });
              
              reject(error);
            }
          });
          
          return hope;
        }
      };
      
      try {
        // Execute the task function
        const result = await task(scope);
        taskCompleted = true;
        
        if (scopeRejected) {
          // Scope already rejected by a child
          return;
        }
        
        // Wait for all children to complete
        if (children.length > 0) {
          await Hope.allSettled(children);
        }
        
        resolve(result);
      } catch (error) {
        if (!scopeRejected) {
          // Task itself threw an error
          scopeRejected = true;
          scopeReason = error;
          
          // Cancel all children
          children.forEach(child => {
            if (child.state === 'pending') {
              child.catch(() => {}); // Prevent unhandled rejection
              if (child.cancel) child.cancel();
            }
          });
          
          reject(error);
        }
      }
    });
  }
  static of(schema) {
    return function(value) {
      return new Hope((resolve, reject) => {
        // Function schema (constructor/type)
        if (typeof schema === 'function') {
          // Handle built-in types
          if (schema === Number) {
            if (typeof value === 'number' && !isNaN(value)) {
              resolve(value);
            } else {
              reject(new TypeError(`Expected number, got ${typeof value}`));
            }
          } else if (schema === String) {
            if (typeof value === 'string') {
              resolve(value);
            } else {
              reject(new TypeError(`Expected string, got ${typeof value}`));
            }
          } else if (schema === Boolean) {
            if (typeof value === 'boolean') {
              resolve(value);
            } else {
              reject(new TypeError(`Expected boolean, got ${typeof value}`));
            }
          } else if (value instanceof schema) {
            // Custom constructor
            resolve(value);
          } else {
            reject(new TypeError(`Expected instance of ${schema.name}, got ${typeof value}`));
          }
        }
        // Object schema (shape validation)
        else if (schema && typeof schema === 'object') {
          // Validate all properties
          for (const key in schema) {
            const expectedType = schema[key];
            const actualType = typeof value[key];
            
            if (actualType !== expectedType) {
              reject(new TypeError(
                `Property "${key}" expected type "${expectedType}", got "${actualType}"`
              ));
              return;
            }
          }
          resolve(value);
        }
        // No validation
        else {
          resolve(value);
        }
      });
    };
  }
  _resolve(value) {
    // Check for double settlement
    if (this._settled) {
      if (Hope.strict) {
        throw new Error('Hope already settled');
      } else if (console && console.warn) {
        console.warn('Hope resolved after being settled (ignored)');
      }
      return;
    }
    
    this._settled = true;
    
    if (value === this) {
      this._reject(new TypeError('Hope cannot resolve to itself'));
      return;
    }
    
    if (value && typeof value.then === 'function') {
      try {
        value.then(
          val => this._resolve(val),
          reason => this._reject(reason)
        );
        return;
      } catch (error) {
        this._reject(error);
        return;
      }
    }
    
    this._state = Hope.FULFILLED;
    this._value = value;
    
    if (Hope.freezeValues && value !== null && typeof value === 'object') {
      this._deepFreeze(value);
    }
    
    this._callSettleCallbacks();
    this._callFulfilledCallbacks();
  }
  _reject(reason) {
    if (this._settled) {
      if (Hope.strict) {
        throw new Error('Hope already settled');
      } else if (console && console.warn) {
        console.warn('Hope rejected after being settled (ignored)');
      }
      return;
    }
    
    this._settled = true;
    this._state = Hope.REJECTED;
    this._reason = reason;
    
    this._callSettleCallbacks();
    this._callRejectedCallbacks();
  }
  _progress(value) {
    if (this._state !== Hope.PENDING) return;
    this._pendingProgressValues.push(value);
    for (const callback of this._progressCallbacks) {
      try {
        callback(value);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    }
  }
  _resolvePromise(resolve, reject, x) {
    if (x === this) {
      reject(new TypeError('Promise cannot be resolved with itself'));
      return;
    }
    if (x && typeof x.then === 'function') {
      let called = false;
      try {
        x.then(
          y => {
            if (called) return;
            called = true;
            this._resolvePromise(resolve, reject, y);
          },
          r => {
            if (called) return;
            called = true;
            reject(r);
          }
        );
      } catch (error) {
        if (!called) {
          reject(error);
        }
      }
    } else {
      resolve(x);
    }
  }
  static _deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return;
    
    if (Object.isFrozen(obj)) return;
    
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
      const value = obj[prop];
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Hope._deepFreeze(value);
      }
    });
  }
  _callSettleCallbacks() {
    const callbacks = this._onSettleCallbacks;
    this._onSettleCallbacks = [];
    
    for (const callback of callbacks) {
      try {
        callback(
          this._state,
          this._state === Hope.FULFILLED ? this._value : this._reason
        );
      } catch (error) {
        console.error('onSettle callback error:', error);
      }
    }
  }
  _callFulfilledCallbacks() {
    const callbacks = this._onFulfilledCallbacks;
    this._onFulfilledCallbacks = [];
    
    for (const callback of callbacks) {
      callback();
    }
  }
  _callRejectedCallbacks() {
    const callbacks = this._onRejectedCallbacks;
    this._onRejectedCallbacks = [];
    
    for (const callback of callbacks) {
      callback();
    }
  }
  get [Symbol.toStringTag]() {
    return 'Hope';
  }
  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    return options.stylize(`Hope { ${this._state} }`, 'special');
  }
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = Hope;
  module.exports.CancelError = CancelError;
  module.exports.AggregateError = AggregateError;
}
if (typeof window !== 'undefined' && !window.Hope) {
  window.Hope = Hope;
  window.CancelError = CancelError;
  window.AggregateError = AggregateError;
}