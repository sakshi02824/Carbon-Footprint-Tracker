document.addEventListener('DOMContentLoaded', () => {
    const apiBaseUrl = 'http://localhost:3000';

    // UI Elements
    const emailStep = document.getElementById('email-step');
    const otpStep = document.getElementById('otp-step');
    const emailForm = document.getElementById('email-form');
    const otpForm = document.getElementById('otp-form');
    const emailInput = document.getElementById('email');
    const otpInput = document.getElementById('otp');
    const userEmailDisplay = document.getElementById('user-email-display');
    const backButton = document.getElementById('back-to-email');
    const loadingSpinner = document.getElementById('loading-spinner');

    // --- Theme Toggler ---
    const themeToggle = document.getElementById('checkbox');
    const currentTheme = localStorage.getItem('theme');

    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark') {
            themeToggle.checked = true;
        }
    }

    themeToggle.addEventListener('change', () => {
        if (themeToggle.checked) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
    });

    // --- Navigation ---
    const showStep = (step) => {
        emailStep.classList.remove('active');
        otpStep.classList.remove('active');
        step.classList.add('active');
    };

    backButton.addEventListener('click', () => {
        showStep(emailStep);
    });

    // --- Form Handling ---
    const showLoading = (isLoading) => {
        loadingSpinner.style.display = isLoading ? 'flex' : 'none';
    };

    // Step 1: Handle Email Submission
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        showLoading(true);

        try {
            const response = await fetch(`${apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send OTP.');
            }

            userEmailDisplay.textContent = email;
            showStep(otpStep); // Move to OTP step
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            showLoading(false);
        }
    });

    // Step 2: Handle OTP Verification
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const otp = otpInput.value;
        showLoading(true);

        try {
            const response = await fetch(`${apiBaseUrl}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to verify OTP.');
            }

            const { token } = await response.json();
            
            // Store the token and redirect to the main app
            localStorage.setItem('authToken', token);
            window.location.href = 'index.html'; // Redirect to the tracker page

        } catch (error) {
            alert(`Error: ${error.message}`);
            otpInput.value = ''; // Clear OTP input on error
        } finally {
            showLoading(false);
        }
    });
});
