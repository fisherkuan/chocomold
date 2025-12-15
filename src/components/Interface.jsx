
import React, { useState } from 'react';
import { Upload, Download } from 'lucide-react';

const Interface = ({ onUpload, onLoadDemo, depth, setDepth, onExport }) => {
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        console.log("Interface: File selected:", file);
        if (file) {
            onUpload(file);
        }
    };

    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'image/svg+xml') {
            onUpload(file);
        } else {
            // Optional: Alert if not an SVG
            console.log("Dropped file is not SVG");
        }
    };

    return (
        <div className="ui-overlay">
            <div className="ui-header">
                <h1>ChocoMold</h1>
            </div>

            <div className="ui-controls">
                <div className="control-group">
                    <div className="info-display">
                        <label>Base Size: 10 x 10 units</label>
                    </div>
                </div>

                <div
                    className={`control-group upload-zone ${isDragging ? 'drag-active' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <label>Upload Pattern (SVG)</label>
                    <div className="file-input-simple">
                        <input type="file" accept=".svg" onChange={handleFileChange} id="file-upload" style={{ display: 'none' }} />
                        <label htmlFor="file-upload" className="custom-file-upload">
                            <Upload size={16} style={{ marginRight: '8px' }} />
                            Choose File or Drag Here
                        </label>
                    </div>
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
