const API_URL = process.env.clienturl;

let currentArticles = [];
let currentCategory = 'general';
let currentCountry = 'us';
let currentPageSize = 12;
let totalAnalyses = 0;
let currentView = 'grid';

// DOM Elements
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const settingsBtn = document.getElementById('settingsBtn');
const categorySelect = document.getElementById('categorySelect');
const countrySelect = document.getElementById('countrySelect');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const fetchNewsBtn = document.getElementById('fetchNews');
const newsContainer = document.getElementById('newsContainer');
const loading = document.getElementById('loading');
const analysisModal = document.getElementById('analysisModal');
const settingsModal = document.getElementById('settingsModal');
const analysisContent = document.getElementById('analysisContent');
const closeModal = document.getElementById('closeModal');
const closeSettings = document.getElementById('closeSettings');
const totalArticlesEl = document.getElementById('totalArticles');  // Fixed variable name
const totalAnalysesEl = document.getElementById('totalAnalyses');
const emptyState = document.getElementById('emptyState');
const toastContainer = document.getElementById('toastContainer');
const scrollTopBtn = document.getElementById('scrollTop');
const viewBtns = document.querySelectorAll('.view-btn');
const themeOptions = document.querySelectorAll('.theme-option');

// Initialize
function init() {
    loadTheme();
    loadPreferences();
    setupEventListeners();
    updateStats();
    checkBackendConnection();
}

// Event Listeners
function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Settings
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    
    // Theme options
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            setTheme(theme);
            themeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
        });
    });
    
    // News controls
    fetchNewsBtn.addEventListener('click', fetchNews);
    categorySelect.addEventListener('change', (e) => {
        currentCategory = e.target.value;
        savePreferences();
    });
    
    countrySelect.addEventListener('change', (e) => {
        currentCountry = e.target.value;
        savePreferences();
    });
    
    pageSizeSelect.addEventListener('change', (e) => {
        currentPageSize = parseInt(e.target.value);
        savePreferences();
    });
    
    // View toggle
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentView = btn.dataset.view;
            newsContainer.dataset.view = currentView;
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            savePreferences();
        });
    });
    
    // Modal close
    closeModal.addEventListener('click', () => analysisModal.classList.add('hidden'));
    
    // Close modals on backdrop click
    [analysisModal, settingsModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
                modal.classList.add('hidden');
            }
        });
    });
    
    // Scroll to top
    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            scrollTopBtn.classList.remove('hidden');
        } else {
            scrollTopBtn.classList.add('hidden');
        }
    });
    
    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            analysisModal.classList.add('hidden');
            settingsModal.classList.add('hidden');
        }
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            fetchNews();
        }
    });
}

// Theme Management
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    // Set active theme option
    themeOptions.forEach(option => {
        if (option.dataset.theme === savedTheme) {
            option.classList.add('active');
        }
    });
}

function setTheme(theme) {
    if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
    }
    
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    
    // Update theme options
    themeOptions.forEach(option => {
        option.classList.remove('active');
        if (option.dataset.theme === newTheme) {
            option.classList.add('active');
        }
    });
    
    showToast(`Switched to ${newTheme} mode`, 'success');
}

// Preferences Management
function loadPreferences() {
    const prefs = JSON.parse(localStorage.getItem('preferences') || '{}');
    
    if (prefs.category) {
        currentCategory = prefs.category;
        categorySelect.value = currentCategory;
    }
    
    if (prefs.country) {
        currentCountry = prefs.country;
        countrySelect.value = currentCountry;
    }
    
    if (prefs.pageSize) {
        currentPageSize = prefs.pageSize;
        pageSizeSelect.value = currentPageSize;
    }
    
    if (prefs.view) {
        currentView = prefs.view;
        newsContainer.dataset.view = currentView;
        viewBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === currentView);
        });
    }
    
    // Load stats
    const stats = JSON.parse(localStorage.getItem('stats') || '{}');
    totalAnalyses = stats.analyses || 0;
}

function savePreferences() {
    const prefs = {
        category: currentCategory,
        country: currentCountry,
        pageSize: currentPageSize,
        view: currentView
    };
    localStorage.setItem('preferences', JSON.stringify(prefs));
}

function updateStats() {
    if (totalArticlesEl) {
        totalArticlesEl.textContent = currentArticles.length;
    }
    if (totalAnalysesEl) {
        totalAnalysesEl.textContent = totalAnalyses;
    }
}

function saveStats() {
    const stats = { analyses: totalAnalyses };
    localStorage.setItem('stats', JSON.stringify(stats));
}

// Toast Notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : '⚠'}</span>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Backend Connection Check
async function checkBackendConnection() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
            console.log('✅ Backend connected');
            fetchNews();
            return true;
        }
    } catch (error) {
        console.error('❌ Backend connection failed:', error);
        showError('Cannot connect to backend server. Make sure it\'s running on http://localhost:3000');
        return false;
    }
}

// Error Display
function showError(message) {
    newsContainer.innerHTML = `
        <div style="grid-column: 1/-1; background: var(--glass-bg); backdrop-filter: blur(20px); padding: 50px; border-radius: var(--radius-xl); text-align: center; box-shadow: var(--shadow-xl); border: 1px solid var(--border-primary);">
            <div style="font-size: 5rem; margin-bottom: 25px;">⚠️</div>
            <h2 style="color: var(--error); margin-bottom: 20px; font-size: 2rem;">Connection Error</h2>
            <p style="color: var(--text-secondary); line-height: 1.8; margin-bottom: 35px; font-size: 1.1rem;">${message}</p>
            <div style="background: var(--bg-secondary); padding: 30px; border-radius: var(--radius-lg); text-align: left; border: 1px solid var(--border-primary);">
                <h3 style="margin-bottom: 20px; color: var(--text-primary); font-size: 1.3rem;">🔧 Quick Fix:</h3>
                <ol style="color: var(--text-secondary); line-height: 2.2; margin-left: 25px; font-size: 1rem;">
                    <li>Open terminal in <code style="background: var(--bg-tertiary); padding: 4px 10px; border-radius: 4px; font-family: monospace;">backend</code> folder</li>
                    <li>Run: <code style="background: var(--bg-tertiary); padding: 4px 10px; border-radius: 4px; font-family: monospace;">npm install</code></li>
                    <li>Run: <code style="background: var(--bg-tertiary); padding: 4px 10px; border-radius: 4px; font-family: monospace;">npm start</code></li>
                    <li>Wait for "Server running" message</li>
                    <li>Refresh this page</li>
                </ol>
            </div>
        </div>
    `;
}

// Fetch News
async function fetchNews() {
    loading.classList.remove('hidden');
    newsContainer.innerHTML = '';
    emptyState.classList.add('hidden');

    try {
        const response = await fetch(`${API_URL}/news?category=${currentCategory}&country=${currentCountry}&pageSize=${currentPageSize}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (data.articles && data.articles.length > 0) {
            currentArticles = data.articles;
            displayNews(data.articles);
            updateStats();
            showToast(`Loaded ${data.articles.length} articles`, 'success');
        } else {
            emptyState.classList.remove('hidden');
            currentArticles = [];
            updateStats();
        }
    } catch (error) {
        console.error('Error fetching news:', error);
        showError(`Failed to fetch news: ${error.message}`);
        showToast('Failed to load news', 'error');
    } finally {
        loading.classList.add('hidden');
    }
}

// Display News
function displayNews(articles) {
    newsContainer.innerHTML = '';
    
    articles.forEach((article, index) => {
        const card = document.createElement('div');
        card.className = 'news-card';
        
        const publishedDate = new Date(article.publishedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        card.innerHTML = `
            <div class="news-image-wrapper">
                ${article.urlToImage 
                    ? `<img src="${article.urlToImage}" alt="${article.title}" class="news-image" onerror="this.parentElement.innerHTML='<div class=\\'news-image\\' style=\\'display:flex;align-items:center;justify-content:center;font-size:4rem;\\'>📰</div>'">` 
                    : '<div class="news-image" style="display:flex;align-items:center;justify-content:center;font-size:4rem;">📰</div>'}
                <div class="news-category-badge">${currentCategory}</div>
            </div>
            <div class="news-content">
                <span class="news-source">${article.source.name}</span>
                <h3 class="news-title">${article.title}</h3>
                <p class="news-description">${article.description || 'No description available.'}</p>
                <div class="news-footer">
                    <span class="news-date">🗓️ ${publishedDate}</span>
                </div>
                <button class="analyze-btn" onclick="analyzeArticle(${index})">
                    🤖 Analyze with AI
                </button>
            </div>
        `;
        
        newsContainer.appendChild(card);
    });
}

// Analyze Article
async function analyzeArticle(index) {
    const article = currentArticles[index];
    
    analysisModal.classList.remove('hidden');
    analysisContent.innerHTML = `
        <div class="analysis-loading">
            <div class="loading-spinner-advanced">
                <div class="spinner-orbit"></div>
                <div class="spinner-orbit"></div>
                <div class="spinner-orbit"></div>
                <div class="spinner-core"></div>
            </div>
            <h3>Analyzing Article...</h3>
            <p>Our AI is reading and understanding the content</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: article.title,
                description: article.description,
                content: article.content
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error + (errorData.hint ? '\n\n' + errorData.hint : ''));
        }

        const analysis = await response.json();
        
        if (analysis.error) {
            throw new Error(analysis.error);
        }
        
        displayAnalysis(analysis, article);
        
        // Update stats
        totalAnalyses++;
        updateStats();
        saveStats();
        
        showToast('Analysis completed!', 'success');
        
    } catch (error) {
        console.error('Error analyzing article:', error);
        showToast('Analysis failed', 'error');
        
        analysisContent.innerHTML = `
            <div style="padding: 50px; text-align: center;">
                <div style="font-size: 5rem; margin-bottom: 25px;">⚠️</div>
                <h3 style="color: var(--error); margin-bottom: 20px; font-size: 1.8rem;">Analysis Failed</h3>
                <p style="color: var(--text-secondary); margin-bottom: 35px; line-height: 1.8;">${error.message}</p>
                <div style="background: var(--bg-secondary); padding: 30px; border-radius: var(--radius-lg); text-align: left; border: 1px solid var(--border-primary);">
                    <h4 style="margin-bottom: 20px; color: var(--text-primary);">🔧 Troubleshooting:</h4>
                    <ul style="color: var(--text-secondary); line-height: 2.2; margin-left: 25px;">
                        <li>Check your Gemini API key in .env file</li>
                        <li>Verify it starts with: <code style="background: var(--bg-tertiary); padding: 2px 8px; border-radius: 4px;">AIzaSy...</code></li>
                        <li>Get a key at: <a href="https://makersuite.google.com/app/apikey" target="_blank" style="color: var(--primary);">Google AI Studio</a></li>
                        <li>Restart backend after updating .env</li>
                    </ul>
                </div>
            </div>
        `;
    }
}

// Display Analysis
function displayAnalysis(analysis, article) {
    const sentimentClass = `sentiment-${analysis.sentiment?.type?.toLowerCase() || 'neutral'}`;
    const sentimentEmoji = {
        'positive': '😊',
        'negative': '😞',
        'neutral': '😐'
    }[analysis.sentiment?.type?.toLowerCase() || 'neutral'];
    
    analysisContent.innerHTML = `
        <div class="analysis-section">
            <h3>📰 Original Article</h3>
            <p><strong>${article.title}</strong></p>
            <p style="margin-top: 12px;">
                <a href="${article.url}" target="_blank">Read full article →</a>
            </p>
        </div>

        <div class="analysis-section">
            <h3>📝 AI Summary</h3>
            <p>${analysis.summary || 'No summary available.'}</p>
        </div>

        <div class="analysis-section">
            <h3>🔑 Key Points</h3>
            <ul class="key-points">
                ${analysis.keyPoints && analysis.keyPoints.length > 0 
                    ? analysis.keyPoints.map(point => `<li>${point}</li>`).join('') 
                    : '<li>No key points available.</li>'}
            </ul>
        </div>

        <div class="analysis-section">
            <h3>💭 Sentiment Analysis</h3>
            <span class="sentiment-badge ${sentimentClass}">
                ${sentimentEmoji} ${analysis.sentiment?.type || 'Unknown'}
            </span>
            <p>${analysis.sentiment?.explanation || 'No explanation available.'}</p>
        </div>

        <div class="analysis-section">
            <h3>🎯 Tone & Style</h3>
            <p>${analysis.tone || 'No tone analysis available.'}</p>
        </div>

        <div class="analysis-section">
            <h3>⚖️ Bias Detection</h3>
            <p>${analysis.biasDetection || 'No bias detection available.'}</p>
        </div>
    `;
}

// Make functions globally accessible
window.analyzeArticle = analyzeArticle;
window.fetchNews = fetchNews;

// Initialize app
window.addEventListener('load', init);
