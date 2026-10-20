// Aplica o tema salvo antes da primeira pintura (carregado de forma síncrona no <head>, sem script inline por causa da CSP).
try { const t = localStorage.getItem('tema'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) { /* sem armazenamento: segue o tema do sistema */ }
