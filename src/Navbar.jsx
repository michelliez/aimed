import React, { useState } from 'react';
import { Menu, X, MessageCircle, Pill, TrendingUp, Heart, MapPin, Home } from 'lucide-react';
import './Navbar.css';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const navItems = [
    { label: 'Home', href: '/', icon: Home },
    { label: 'Mix & Check', href: '/mix', icon: Pill },
    { label: 'Compare', href: '/compare', icon: TrendingUp },
    { label: 'Recommend', href: '/recommend', icon: Heart },
    { label: 'Where to Get', href: '/where-to-get', icon: MapPin },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
      `}</style>

      <nav className="aimed-navbar">
        {/* Logo & Brand */}
        <div className="navbar-brand">
          <div className="logo-container">
            <MessageCircle className="logo-icon" size={28} />
            <span className="brand-name">AIMED</span>
          </div>
          <p className="brand-tagline">Medicine AI</p>
        </div>

        {/* Desktop Navigation */}
        <div className="nav-links-container">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <a
                key={index}
                href={item.href}
                className="nav-link"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>

        {/* CTA Button */}
        <button className="cta-button">
          Start Chat
          <span className="button-glow"></span>
        </button>

        {/* Mobile Menu Toggle */}
        <button className="mobile-toggle" onClick={toggleMenu}>
          {isOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${isOpen ? 'open' : ''}`}>
        <div className="mobile-menu-content">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <a
                key={index}
                href={item.href}
                className="mobile-nav-link"
                onClick={() => setIsOpen(false)}
              >
                <Icon size={24} />
                <span>{item.label}</span>
              </a>
            );
          })}
          <button className="mobile-cta">Start Chat</button>
        </div>
      </div>
    </>
  );
}