var BenchmarkStore = (function() {
    var DB_NAME = 'benchmark_db';
    var DB_VERSION = 2;
    var db = null;

    function open() {
        return new Promise(function(resolve, reject) {
            if (db) { resolve(db); return; }
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onblocked = function() { reject(new Error('Database upgrade blocked by another tab')); };
            request.onupgradeneeded = function(e) {
                var database = e.target.result;
                if (!database.objectStoreNames.contains('results')) {
                    database.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
                }
                if (!database.objectStoreNames.contains('votes')) {
                    database.createObjectStore('votes', { keyPath: 'id', autoIncrement: true });
                }
                if (!database.objectStoreNames.contains('generations')) {
                    database.createObjectStore('generations', { keyPath: 'id', autoIncrement: true });
                }
                if (!database.objectStoreNames.contains('sessions')) {
                    database.createObjectStore('sessions', { keyPath: 'id' });
                }
            };
            request.onsuccess = function(e) {
                db = e.target.result;
                db.onclose = function() { db = null; };
                db.onversionchange = function() { if (db) { db.close(); } db = null; };
                resolve(db);
            };
            request.onerror = function(e) { reject(e.target.error); };
        });
    }

    function add(storeName, data) {
        return open().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                var req = store.add(data);
                tx.oncomplete = function() { resolve(req.result); };
                tx.onerror = function() { reject(tx.error); };
                tx.onabort = function() { reject(tx.error || new Error('Transaction aborted')); };
                req.onerror = function() {};
            });
        });
    }

    function getAll(storeName) {
        return open().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(storeName, 'readonly');
                var store = tx.objectStore(storeName);
                var req = store.getAll();
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function clear(storeName) {
        return open().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                var req = store.clear();
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { reject(tx.error); };
                tx.onabort = function() { reject(tx.error || new Error('Transaction aborted')); };
                req.onerror = function() {};
            });
        });
    }

    function get(storeName, key) {
        return open().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(storeName, 'readonly');
                var store = tx.objectStore(storeName);
                var req = store.get(key);
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function put(storeName, data) {
        return open().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(storeName, 'readwrite');
                var store = tx.objectStore(storeName);
                var req = store.put(data);
                tx.oncomplete = function() { resolve(req.result); };
                tx.onerror = function() { reject(tx.error); };
                tx.onabort = function() { reject(tx.error || new Error('Transaction aborted')); };
                req.onerror = function() {};
            });
        });
    }

    return { open: open, add: add, getAll: getAll, clear: clear, get: get, put: put };
})();
