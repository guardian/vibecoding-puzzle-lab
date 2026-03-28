
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const DancingFerret = () => {
  const [position, setPosition] = useState(0);
  const [bounce, setBounce] = useState(0);
  const [squish, setSquish] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setPosition((prev) => (prev + 1) % 100);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const bounceInterval = setInterval(() => {
      setBounce((prev) => {
        const newBounce = prev + 0.5;
        return newBounce > 20 ? 0 : newBounce;
      });
    }, 50);

    return () => clearInterval(bounceInterval);
  }, []);

  useEffect(() => {
    const squishInterval = setInterval(() => {
      setSquish((prev) => {
        const phase = (Date.now() / 100) % (Math.PI * 2);
        return 1 + Math.sin(phase) * 0.15;
      });
    }, 50);

    return () => clearInterval(squishInterval);
  }, []);

  const bounceOffset = Math.abs(Math.sin((bounce / 20) * Math.PI)) * 30;

  return (
    <div className="w-full h-screen bg-gradient-to-b from-purple-200 via-pink-200 to-yellow-100 flex items-center justify-center overflow-hidden relative">
      <div className="absolute top-8 left-0 right-0 text-center">
        <h1 className="text-4xl font-bold text-purple-800 mb-2">Dancing Ferret!</h1>
        <p className="text-lg text-purple-600">Watch the ferret groove! 🎵</p>
      </div>

      <div
        className="relative transition-all duration-100"
        style={{
          transform: `translateX(${position * 4 - 200}px) translateY(-${bounceOffset}px) scaleX(${squish}) scaleY(${2 - squish})`
        }}
      >
        <div className="text-9xl select-none">
          🦦
        </div>
      </div>

      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
        <div className="text-4xl animate-bounce" style={{ animationDelay: '0ms' }}>🎵</div>
        <div className="text-4xl animate-bounce" style={{ animationDelay: '200ms' }}>🎶</div>
        <div className="text-4xl animate-bounce" style={{ animationDelay: '400ms' }}>🎵</div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<DancingFerret />);
