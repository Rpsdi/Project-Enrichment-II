const projectId = "dummy-dashboard-qc";
const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/noc_laporan`;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_ticket_detail") {
        fetch(url)
            .then(res => res.json())
            .then(data => {
                // Cari dokumen yang problem_id-nya sesuai dengan yang di-hover
                const targetDoc = data.documents.find(doc => 
                    doc.fields.problem_id && doc.fields.problem_id.stringValue === request.problem_id
                );

                if (targetDoc) {
                    sendResponse({ success: true, fields: targetDoc.fields });
                } else {
                    sendResponse({ success: false });
                }
            })
            .catch(() => sendResponse({ success: false }));
            
        return true; // Wajib ditambahkan agar Chrome tahu proses fetch ini asynchronous
    }
});