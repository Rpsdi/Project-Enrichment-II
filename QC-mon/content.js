// 1. Bangun Panel HUD yang selalu muncul
const hud = document.createElement('div');
hud.id = 'noc-inspector-hud';
hud.innerHTML = `
    <div class="hud-header">👁️ QC Tools</div>
    <div id="hud-content" style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
        Arahkan kursor ke kartu tiket untuk memindai data internal...
    </div>
`;
document.body.appendChild(hud);

let lastHoveredId = null;

// 2. Deteksi pergerakan mouse (Hover)
document.addEventListener('mouseover', (e) => {
    // Cari apakah kursor sedang berada di atas kartu problem
    const card = e.target.closest('.problem-card');
    
    if (card) {
        // Ambil ID tiket dari dalam kartu (misal: PRB-1234)
        const idElement = card.querySelector('.card-id');
        if (!idElement) return;
        
        const problemId = idElement.innerText;

        // Cegah spam request jika ID masih sama dengan yang sebelumnya di-hover
        if (problemId === lastHoveredId) return;
        lastHoveredId = problemId;

        document.getElementById('hud-content').innerHTML = `<div style="text-align:center;">Memindai ${problemId}...</div>`;

        // 3. Minta data ke background.js
        chrome.runtime.sendMessage({ action: "get_ticket_detail", problem_id: problemId }, (response) => {
            if (response && response.success) {
                const f = response.fields;
                const judul = f.judul?.stringValue || "-";
                const kronologi = f.kronologi?.stringValue || "Belum ada kronologi";
                const metode = f.metode?.stringValue || "Belum ada tindakan";
                const status = f.status?.stringValue || "Open";
                const operator = f.operator?.stringValue || "-";

                // 4. Tampilkan data ke panel HUD
                document.getElementById('hud-content').innerHTML = `
                    <div style="margin-bottom: 8px;">
                        <span style="background: ${status === 'Resolved' ? '#10b981' : '#f59e0b'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">${status.toUpperCase()}</span>
                        <strong style="margin-left: 5px; font-size: 14px;">${problemId}</strong>
                    </div>
                    <div style="font-weight: bold; color: #0f172a; margin-bottom: 10px; font-size: 13px;">${judul}</div>
                    
                    <div class="hud-section">
                        <strong>PIC Operator:</strong><br>${operator}
                    </div>
                    <div class="hud-section">
                        <strong>Kronologi:</strong><br><span style="color:#475569;">${kronologi}</span>
                    </div>
                    <div class="hud-section">
                        <strong>Metode Resolusi:</strong><br><span style="color:#475569;">${metode}</span>
                    </div>
                `;
            }
        });
    }
});

// Reset panel jika kursor keluar dari area problem list
document.addEventListener('mouseout', (e) => {
    const list = e.target.closest('.problem-list');
    if (!list && e.target.id !== 'noc-inspector-hud' && !e.target.closest('#noc-inspector-hud')) {
        lastHoveredId = null;
        document.getElementById('hud-content').innerHTML = `
            <div style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
                Arahkan kursor ke kartu tiket untuk memindai data internal...
            </div>
        `;
    }
});