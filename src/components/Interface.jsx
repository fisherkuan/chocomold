import React, { useState } from 'react';
import { Upload, Download, FileUp } from 'lucide-react';

const ToggleSwitch = ({ checked, onChange }) => (
    <div
        onClick={() => onChange(!checked)}
        style={{
            width: '40px',
            height: '24px',
            background: checked ? '#8b5a38' : '#ccc',
            borderRadius: '12px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s'
        }}
    >
        <div style={{
            width: '18px',
            height: '18px',
            background: 'white',
            borderRadius: '50%',
            position: 'absolute',
            top: '3px',
            left: checked ? '19px' : '3px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }} />
    </div>
);

const Interface = ({ onUpload, depth, setDepth, scale, setScale, invert, setInvert, onExport }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) onUpload(file);
    };

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
        } else if (file) {
            alert("Please upload a valid SVG file.");
        }
    };

    return (
        <div
            className={`ui-overlay ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(139, 90, 56, 0.8)',
                    zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '1.5rem', fontWeight: 'bold'
                }}>
                    Drop SVG Pattern Here
                </div>
            )}

            <div className="ui-header">
                <h1>ChocoMold</h1>
                <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>Base Dimensions: 10 × 10</p>
            </div>

            <div className="ui-controls">
                <div className="control-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <div className="file-input-wrapper" style={{ flex: 1 }}>
                            <FileUp size={16} />
                            <span>Upload Pattern (SVG)</span>
                            <input type="file" accept=".svg" onChange={handleFileChange} style={{ display: 'none' }} />
                        </div>
                    </label>
                    <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px', textAlign: 'center' }}>
                        or drag and drop file here
                    </p>
                </div>

                <div className="control-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label>Invert Pattern</label>
                        <ToggleSwitch checked={invert} onChange={setInvert} />
                    </div>
                </div>

                <div className="control-group">
                    <label>Pattern Scale: {Math.round((scale ?? 1) * 100)}%</label>
                    <input
                        type="range"
                        min="0.1"
                        max="1.5"
                        step="0.05"
                        value={scale ?? 1}
                        onChange={(e) => setScale(parseFloat(e.target.value))}
                    />
                </div>

                <div className="control-group">
                    <label>Engraving Depth: {depth.toFixed(1)}</label>
                    <input
                        type="range"
                        min="0.05"
                        max="0.9"
                        step="0.05"
                        value={depth}
                        onChange={(e) => setDepth(parseFloat(e.target.value))}
                    />
                </div>

                <div className="control-group">
                    <button onClick={onExport} className="primary-button">
                        <Download size={18} /> Export STL
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Interface;
