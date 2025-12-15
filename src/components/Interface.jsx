
import React from 'react';
import { Upload, Download } from 'lucide-react';

const Interface = ({ onUpload, onLoadDemo, depth, setDepth, onExport }) => {
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        console.log("Interface: File selected:", file);
        if (file) {
            onUpload(file);
        }
    };

    return (
        <div className="ui-overlay">
            <div className="ui-header">
                <h1>ChocoMold</h1>
            </div>

            <div className="ui-controls">
                <div className="control-group">
                    <label>Upload Pattern (SVG)</label>
                    <div className="file-input-simple">
                        <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Upload Pattern (SVG): </label>
                        <input type="file" accept=".svg" onChange={handleFileChange} />
                    </div>
                    <button style={{ marginTop: '0.5rem', fontSize: '0.8rem', background: '#795548' }} onClick={onLoadDemo}>
                        Load Demo Star
                    </button>
                </div>

                <div className="control-group">
                    <label>Engraving Depth: {depth.toFixed(1)}mm</label>
                    <input
                        type="range"
                        min="0.05"
                        max="0.9"
                        step="0.1"
                        value={depth}
                        onChange={(e) => setDepth(parseFloat(e.target.value))}
                    />
                </div>

                <div className="control-group">
                    <button onClick={onExport}>
                        <Download size={18} /> Export STL
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Interface;
