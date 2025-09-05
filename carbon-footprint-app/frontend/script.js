document.addEventListener('DOMContentLoaded', () => {
    const apiBaseUrl = 'http://localhost:3000';
    const authToken = localStorage.getItem('authToken');

    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    // --- Global State ---
    let emissionsChart = null;

    // --- UI Elements ---
    const appContainer = document.querySelector('.app-container');
    const sideMenu = document.getElementById('side-menu');
    const menuButton = document.getElementById('menu-button');
    const menuOverlay = document.getElementById('menu-overlay');
    const navLinks = document.querySelectorAll('.nav-link');
    const appTitle = document.getElementById('app-title');
    const views = document.querySelectorAll('.view');
    
    const profileButton = document.getElementById('profile-button');
    const profileDropdown = document.getElementById('profile-dropdown');
    const userEmailDisplay = document.getElementById('user-email-display');
    const logoutButton = document.getElementById('logout-button');
    const themeToggle = document.getElementById('theme-toggle');

    const activityForm = document.getElementById('activity-form');
    const activityTypeSelect = document.getElementById('activity-type');
    const unitDisplay = document.getElementById('unit-display');
    const activityList = document.getElementById('activity-list');
    
    const totalEmissionsEl = document.getElementById('total-emissions');
    const topActivityEl = document.getElementById('top-activity');

    // New UI Elements
    const recommendationText = document.getElementById('ai-recommendation-text');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatWindow = document.getElementById('chat-window');

    const unitMap = {
        car_petrol: 'km',
        flight_short: 'km',
        electricity: 'kWh',
        beef: 'kg',
        chicken: 'kg',
    };
    
    activityTypeSelect.addEventListener('change', () => {
        const selectedType = activityTypeSelect.value;
        unitDisplay.textContent = unitMap[selectedType] || 'units';
    });
    
    // --- Theme Toggler ---
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark') themeToggle.checked = true;
    }
    themeToggle.addEventListener('change', () => {
        const theme = themeToggle.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });

    // --- Menu & Navigation ---
    const toggleMenu = () => {
        sideMenu.classList.toggle('open');
        menuOverlay.classList.toggle('show');
        appContainer.classList.toggle('menu-open');
    };
    menuButton.addEventListener('click', toggleMenu);
    menuOverlay.addEventListener('click', toggleMenu);

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = link.getAttribute('data-view');
            
            views.forEach(view => view.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');

            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');
            
            appTitle.textContent = link.textContent;
            if (sideMenu.classList.contains('open')) {
                toggleMenu();
            }
        });
    });

    // --- Profile & Logout ---
    const fetchUserProfile = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/auth/me`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!response.ok) throw new Error('Could not fetch profile.');
            const user = await response.json();
            userEmailDisplay.textContent = user.email;
            document.getElementById('profile-email').textContent = user.email;
        } catch (error) {
            console.error(error);
            userEmailDisplay.textContent = 'Error';
        }
    };
    profileButton.addEventListener('click', (e) => { e.stopPropagation(); profileDropdown.classList.toggle('show'); });
    logoutButton.addEventListener('click', () => { localStorage.removeItem('authToken'); window.location.href = 'login.html'; });
    window.addEventListener('click', (e) => { if (!profileButton.contains(e.target) && profileDropdown.classList.contains('show')) profileDropdown.classList.remove('show'); });

    // --- Data Fetching & Rendering ---
    const updateDashboard = (activities) => {
        const total = activities.reduce((sum, act) => sum + act.emission, 0);
        totalEmissionsEl.textContent = `${total.toFixed(2)} kg CO₂`;

        if (activities.length > 0) {
            const top = activities.reduce((prev, current) => (prev.emission > current.emission) ? prev : current);
            topActivityEl.textContent = top.activity_type.replace(/_/g, ' ');
        } else {
            topActivityEl.textContent = '-';
        }
    };

    const renderChart = (activities) => {
        const ctx = document.getElementById('emissions-chart').getContext('2d');
        const groupedData = activities.reduce((acc, act) => {
            const type = act.activity_type.replace(/_/g, ' ');
            if (!acc[type]) acc[type] = 0;
            acc[type] += act.emission;
            return acc;
        }, {});

        if (emissionsChart) emissionsChart.destroy();
        
        emissionsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(groupedData),
                datasets: [{
                    data: Object.values(groupedData),
                    backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'],
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg-color'),
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    };

    const fetchActivities = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/activities`, { headers: { 'Authorization': `Bearer ${authToken}` }});
            if (!response.ok) throw new Error('Failed to fetch activities');
            const activities = await response.json();
            
            updateDashboard(activities);
            renderChart(activities);

            activityList.innerHTML = '';
            activities.forEach(activity => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="activity-details">
                        <span class="activity-name">${activity.activity_type.replace(/_/g, ' ')}</span>
                        <span class="activity-amount">${activity.amount} ${activity.unit}</span>
                    </div>
                    <span class="emission">${activity.emission} kg CO₂</span>
                `;
                activityList.appendChild(li);
            });
        } catch (error) { console.error(error); }
    };
    
    const fetchRecommendation = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/api/recommendation`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!response.ok) throw new Error('Failed to fetch recommendation');
            const data = await response.json();
            recommendationText.textContent = data.tip;
        } catch (error) {
            console.error(error);
            recommendationText.textContent = 'Could not load a tip right now.';
        }
    };


    // --- Form Submission ---
    activityForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const activityType = document.getElementById('activity-type').value;
        const amount = document.getElementById('amount').value;

        if (!activityType || !amount) return alert('Please fill in all fields.');

        try {
            const response = await fetch(`${apiBaseUrl}/activities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ activity_type: activityType, amount: parseFloat(amount) }),
            });
            if (!response.ok) throw new Error('Failed to log activity');
            
            activityForm.reset();
            unitDisplay.textContent = 'km'; // Reset unit
            fetchActivities();
            fetchRecommendation(); // Update recommendation after new activity
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    });

    // --- Chatbot Interaction ---
    const appendChatMessage = (sender, message) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message', `${sender}-message`);
        const p = document.createElement('p');
        p.textContent = message;
        messageDiv.appendChild(p);
        chatWindow.appendChild(messageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll to bottom
    };

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;

        appendChatMessage('user', message);
        chatInput.value = '';

        try {
            const response = await fetch(`${apiBaseUrl}/api/chatbot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ message })
            });
            if (!response.ok) throw new Error('Chatbot error');

            const data = await response.json();
            appendChatMessage('bot', data.reply);
        } catch (error) {
            console.error(error);
            appendChatMessage('bot', "Sorry, I'm having trouble connecting right now.");
        }
    });

    // --- Initial Load ---
    const initialLoad = () => {
        fetchUserProfile();
        fetchActivities();
        fetchRecommendation();
    };

    initialLoad();
});