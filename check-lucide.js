const lucide = require('lucide-react');
console.log('Table exported:', !!lucide.Table);
console.log('files:', Object.keys(lucide).filter(k => k.startsWith('Table')));
