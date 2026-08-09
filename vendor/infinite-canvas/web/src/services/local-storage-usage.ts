export type IndexedDbStoreUsage = { name: string; records: number; bytes: number };
export type IndexedDbDatabaseUsage = { name: string; version: number; bytes: number; stores: IndexedDbStoreUsage[] };
export type LocalStorageUsage = { usage: number; quota: number; contentBytes: number; databases: IndexedDbDatabaseUsage[] };

export async function readLocalStorageUsage(): Promise<LocalStorageUsage> {
    const [estimate, database] = await Promise.all([readStorageEstimate(), readDatabaseUsage("infinite-canvas")]);
    return { usage: estimate.usage, quota: estimate.quota, contentBytes: database.bytes, databases: [database] };
}

async function readStorageEstimate(): Promise<{ usage: number; quota: number }> {
    try {
        const estimate = await navigator.storage?.estimate?.();
        return { usage: Number(estimate?.usage) || 0, quota: Number(estimate?.quota) || 0 };
    } catch {
        return { usage: 0, quota: 0 };
    }
}

function emptyDatabase(name: string): IndexedDbDatabaseUsage {
    return { name, version: 0, bytes: 0, stores: [] };
}

function readDatabaseUsage(name: string): Promise<IndexedDbDatabaseUsage> {
    if (typeof indexedDB === "undefined") return Promise.resolve(emptyDatabase(name));
    return new Promise<IndexedDbDatabaseUsage>((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(name);
        } catch {
            resolve(emptyDatabase(name));
            return;
        }
        request.onerror = () => reject(request.error || new Error("IndexedDB is unavailable"));
        request.onsuccess = () => {
            const database = request.result;
            const names = Array.from(database.objectStoreNames);
            if (!names.length) {
                database.close();
                resolve({ name, version: database.version, bytes: 0, stores: [] });
                return;
            }
            let transaction: IDBTransaction;
            try {
                transaction = database.transaction(names, "readonly");
            } catch (error) {
                database.close();
                reject(error);
                return;
            }
            try {
                const storeUsage = names.map((storeName) => readStoreUsage(transaction.objectStore(storeName)));
                Promise.all(storeUsage)
                    .then((stores) => resolve({ name, version: database.version, bytes: stores.reduce((total, store) => total + store.bytes, 0), stores: stores.sort((a, b) => b.bytes - a.bytes) }))
                    .catch(reject)
                    .finally(() => database.close());
            } catch (error) {
                database.close();
                reject(error);
            }
        };
    }).catch(() => emptyDatabase(name));
}

function readStoreUsage(store: IDBObjectStore) {
    return new Promise<IndexedDbStoreUsage>((resolve, reject) => {
        let records = 0;
        let bytes = 0;
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ name: store.name, records, bytes });
                return;
            }
            records += 1;
            bytes += valueBytes(cursor.value);
            cursor.continue();
        };
    });
}

function valueBytes(value: unknown) {
    if (value instanceof Blob) return value.size;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}
