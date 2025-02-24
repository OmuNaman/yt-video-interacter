document.addEventListener('DOMContentLoaded', () => {
    const landingPage = document.getElementById('landingPage');
    const contentPage = document.getElementById('contentPage');
    const videoInput = document.getElementById('videoInput');
    const submitButton = document.getElementById('submitButton');
    const videoContainer = document.getElementById('videoContainer');
    const tabButtons = document.querySelectorAll('.tab-button');

    let videoTranscript = null;
    let currentVideoUrl = null;  // Store the current video URL

    // Handle video submission
    submitButton.addEventListener('click', async () => {
        const videoUrl = videoInput.value;
        if (videoUrl) {
            currentVideoUrl = videoUrl; // Set current video URL
            videoTranscript = null; // clear transcript
            const videoId = extractVideoId(videoUrl);
            if (videoId) {
                embedVideo(videoId);
                landingPage.classList.add('hidden');
                contentPage.classList.remove('hidden');

                // Fetch transcript from the backend
                try {
                    const response = await fetch('http://127.0.0.1:5000/transcript', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ videoUrl: videoUrl })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }

                    const data = await response.json();

                    if (data.error) {
                        alert(`Error fetching transcript: ${data.error}`);
                    } else {
                        // For now just get first subtitle if there is one
                        let firstTranscriptKey = Object.keys(data)[0];
                        videoTranscript = data[firstTranscriptKey];

                    }

                } catch (error) {
                    console.error("Error fetching transcript:", error);
                    alert('Failed to fetch transcript.  Check console for details.');
                }

            } else {
                alert('Please enter a valid YouTube URL');
            }
        } else {
            alert('Please enter a YouTube URL.');
        }
    });

    // Handle tab switching (same as before)
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(`${tabId}Tab`).classList.add('active');
        });
    });

    // Helper Functions (same as before)
    function extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    function embedVideo(videoId) {
        videoContainer.innerHTML = `
            <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/${videoId}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
            ></iframe>
        `;
    }

    // Add resize functionality (same as before)
    const resizeHandle = document.getElementById('resizeHandle');
    const sidebar = document.querySelector('.sidebar');
    let isResizing = false;

    resizeHandle.addEventListener('mousedown', initResize);

    function initResize(e) {
        isResizing = true;
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);

        document.body.classList.add('resizing');
    }

    function resize(e) {
        if (!isResizing) return;

        const containerWidth = document.querySelector('.main-content').offsetWidth;
        let newWidth = e.clientX;

        const minWidth = 300;
        const maxWidth = containerWidth - 400;

        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        const sidebarWidth = containerWidth - newWidth;
        sidebar.style.flex = `0 0 ${sidebarWidth}px`;

        window.requestAnimationFrame(() => {
            videoContainer.style.flex = '1';
        });
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);

        document.body.classList.remove('resizing');
    }

    // Add this CSS rule dynamically
    const style = document.createElement('style');
    style.textContent = `
        .resizing iframe {
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);

    // Chat Functionality (Enhanced)
    const chatMessages = document.querySelector('.chat-messages');
    const chatInput = document.querySelector('.chat-input input');
    const sendButton = document.querySelector('.send-button');
    let isGeneratingResponse = false; // Flag to prevent multiple requests

    sendButton.addEventListener('click', async () => {
        const userMessage = chatInput.value;
        if (userMessage && !isGeneratingResponse) {  //Check if another message is generating
            isGeneratingResponse = true;
            chatInput.disabled = true; // Disable input while generating
            sendButton.disabled = true;

            addMessage(userMessage, 'user');
            chatInput.value = '';

            // Add "..." loading indicator
            const loadingIndicator = document.createElement('div');
            loadingIndicator.classList.add('message', 'ai', 'loading');
            loadingIndicator.textContent = '...';
            chatMessages.appendChild(loadingIndicator);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Send message to the backend
            try {
                const response = await fetch('http://127.0.0.1:5000/chat', { // Pass videoUrl
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        videoUrl: currentVideoUrl,  // Send the current video URL
                        message: userMessage,
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();
                if (data.error) {
                    loadingIndicator.remove(); // remove the indicator
                    addMessage(`Error: ${data.error}`, 'ai');
                } else {
                    loadingIndicator.remove(); // remove the indicator
                    addMessage(data.response, 'ai');
                }


            } catch (error) {
                console.error("Error sending chat message:", error);
                loadingIndicator.remove(); // remove the indicator
                addMessage('Failed to send message. Check console.', 'ai');
            } finally {
                isGeneratingResponse = false;
                chatInput.disabled = false;
                sendButton.disabled = false;
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });

    function addMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        messageElement.textContent = message;
        chatMessages.appendChild(messageElement);
    }
});