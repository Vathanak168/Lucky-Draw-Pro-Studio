(function () {
    const legacyKeys = [
        'luckyDrawSetupData',
        'luckyDrawParticipants',
        'luckyDrawSavedProjects',
        'luckyDrawState',
        'luckyDrawCategoryQuotas',
        'luckyDrawAudioSettings',
        'luckyDrawTelegramSettings',
        'luckyDrawLastOpenedProjectId',
        'luckyDrawFontSizeCache',
        'ldp_ribbon_mode',
        'ldp_pool_ribbon_mode',
        'ldp_default_migration_v6_num'
    ];
    const status = document.getElementById('status');
    const inspectBtn = document.getElementById('inspectBtn');
    const migrateBtn = document.getElementById('migrateBtn');
    const removeBtn = document.getElementById('removeBtn');
    let recoveredStorage = null;
    let migratedKeys = [];

    function append(message) {
        status.textContent += `\n${message}`;
    }

    inspectBtn.addEventListener('click', async () => {
        inspectBtn.disabled = true;
        migrateBtn.disabled = true;
        removeBtn.disabled = true;
        recoveredStorage = {};
        migratedKeys = [];
        status.textContent = 'Inspecting one key at a time...';

        for (const key of legacyKeys) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            try {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    recoveredStorage[key] = value;
                    append(`Found ${key}: ${Math.ceil(value.length * 2 / 1024).toLocaleString()} KB`);
                }
            } catch (error) {
                append(`Could not read ${key}: ${error.message}`);
            }
        }

        const count = Object.keys(recoveredStorage).length;
        append(count ? `Inspection complete. ${count} key(s) can be migrated.` : 'No legacy project data was found in this browser profile.');
        migrateBtn.disabled = count === 0;
        inspectBtn.disabled = false;
    });

    migrateBtn.addEventListener('click', async () => {
        if (!recoveredStorage) return;
        migrateBtn.disabled = true;
        append('Writing recovered data to local Asta project files...');
        try {
            const response = await fetch('/api/desktop/legacy/migrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storage: recoveredStorage })
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.detail || 'Migration failed');
            migratedKeys = Object.keys(recoveredStorage);
            append(`Migration complete. ${result.recoveredFiles.length} project file(s) created:`);
            result.recoveredFiles.forEach(path => append(`  ${path}`));
            append('You may now remove only the migrated keys, or keep them as an extra backup.');
            removeBtn.disabled = false;
        } catch (error) {
            append(`Migration failed: ${error.message}`);
            migrateBtn.disabled = false;
        }
    });

    removeBtn.addEventListener('click', () => {
        if (!migratedKeys.length || !confirm('Remove only the project keys that were migrated successfully?')) return;
        const failed = [];
        for (const key of migratedKeys) {
            try { localStorage.removeItem(key); } catch (error) { failed.push(key); }
        }
        append(failed.length ? `Some keys could not be removed: ${failed.join(', ')}` : 'Migrated project browser keys were removed.');
        removeBtn.disabled = true;
    });
})();
