
import fs from 'fs';
import path from 'path';

console.log('CWD:', process.cwd());

const uploadsPath = path.join(process.cwd(), "public/uploads");
console.log('Uploads Path:', uploadsPath);

if (fs.existsSync(uploadsPath)) {
    console.log('Uploads directory exists.');
    const testFile = path.join(uploadsPath, "test.txt");
    if (fs.existsSync(testFile)) {
        console.log('test.txt exists.');
    } else {
        console.log('test.txt DOES NOT exist.');
    }
} else {
    console.log('Uploads directory DOES NOT exist.');
}
