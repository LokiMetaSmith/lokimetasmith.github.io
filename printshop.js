// printshop.js

// --- Global Variables ---
let peer; // PeerJS instance for the print shop
let currentShopPeerId = null; // The actual Peer ID being used
const connectedClients = {}; // Store active connections to clients: { clientPeerId: connectionObject }
const imageDataBuffers = {}; // To store incoming image chunks: { dataId: { chunks: [], totalChunks: 0, receivedChunks: 0 } }

// --- DOM Elements ---
// These will be assigned in the DOMContentLoaded listener
let peerIdDisplaySpan, peerConnectionMessage, shopPeerIdInput, setPeerIdBtn;
let ordersListDiv, noOrdersMessage, connectionStatusDot;
let squareApiKeyInputEl; // For the API Key input

// --- PeerJS Configuration ---
function initializeShopPeer(requestedId = null) {
    if (peer && !peer.destroyed) {
        console.log("Destroying existing peer instance before creating a new one.");
        try {
            peer.destroy();
        } catch (e) {
            console.error("Error destroying previous peer instance:", e);
        }
    }

    const peerIdToUse = requestedId && requestedId.trim() !== '' ? requestedId.trim() : null;

    try {
        if (typeof Peer === 'undefined') {
            console.error("PeerJS library is not loaded!");
            updateShopPeerStatus("PeerJS library not loaded!", "error", "Error");
            return;
        }

        console.log(`Initializing shop peer with ID: ${peerIdToUse || '(auto-generated)'}`);
        peer = new Peer(peerIdToUse, {
            // debug: 3 // Uncomment for verbose PeerJS logging
        });
        updateShopPeerStatus("Initializing...", "pending", "Initializing...");

        peer.on('open', (id) => {
            currentShopPeerId = id;
            console.log('Print Shop PeerJS ID is:', currentShopPeerId);
            updateShopPeerStatus(`Listening for orders. Share this ID with the client app.`, "success", currentShopPeerId);
            if (shopPeerIdInput && !shopPeerIdInput.value && peerIdToUse === null) { // Update input if ID was auto-generated
                shopPeerIdInput.value = currentShopPeerId;
            }
        });

        peer.on('connection', (conn) => {
            console.log(`Incoming connection from client: ${conn.peer}`);
            updateShopPeerStatus(`Connected to client: ${conn.peer.substring(0,8)}...`, "success", currentShopPeerId);
            if(noOrdersMessage) noOrdersMessage.style.display = 'none';

            connectedClients[conn.peer] = conn;

            conn.on('data', (dataFromClient) => {
                console.log(`Received data from ${conn.peer}:`, dataFromClient);
                if (dataFromClient.type === 'newOrder') {
                    displayNewOrder(dataFromClient, conn.peer);
                } else if (dataFromClient.type === 'imageDataChunk') {
                    handleImageDataChunk(dataFromClient, conn.peer);
                } else {
                    console.warn("Received unknown data type from client:", dataFromClient);
                }
            });

            conn.on('close', () => {
                handleClientDisconnect(conn.peer);
            });

            conn.on('error', (err) => {
                console.error(`Error with connection from ${conn.peer}:`, err);
                updateShopPeerStatus(`Error with client ${conn.peer.substring(0,8)}...`, "error", currentShopPeerId);
                const orderCard = findOrderCardByClientPeerId(conn.peer);
                if (orderCard) {
                    const statusEl = orderCard.querySelector('.payment-processing-status');
                    if(statusEl) statusEl.textContent = `Connection Error: ${err.message}`;
                }
            });
        });

        peer.on('disconnected', () => {
            console.warn('Shop peer disconnected from PeerJS server. Attempting to reconnect...');
            updateShopPeerStatus("Disconnected from PeerJS server. Reconnecting...", "pending", "Reconnecting...");
            if (peer && !peer.destroyed) {
                try { peer.reconnect(); } catch(e) { console.error("Error reconnecting peer:", e); }
            }
        });

        peer.on('close', () => {
            console.log('Shop peer instance closed.');
            updateShopPeerStatus("Peer connection closed. Please Set/Refresh ID.", "error", "Closed");
            currentShopPeerId = null;
        });

        peer.on('error', (err) => {
            console.error('Shop PeerJS general error:', err);
            let message = `Error: ${err.message || err.type || 'Unknown PeerJS error'}`;
             if (err.type === 'unavailable-id' && shopPeerIdInput) {
                message = `Error: Requested Peer ID "${shopPeerIdInput.value}" is already taken. Try another or leave blank.`;
                shopPeerIdInput.value = '';
            } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(err.type)) {
                message = "Error connecting to PeerJS server. Check network or try again later.";
            }
            updateShopPeerStatus(message, "error", "Error");
            currentShopPeerId = null;
        });

    } catch (e) {
        console.error("Error initializing PeerJS:", e);
        updateShopPeerStatus(`Critical PeerJS Init Error: ${e.message}`, "error", "Error");
    }
}

function handleClientDisconnect(clientPeerId) {
    console.log(`Connection from ${clientPeerId} closed.`);
    updateShopPeerStatus(`Client ${clientPeerId.substring(0,8)}... disconnected.`, "pending", currentShopPeerId);
    delete connectedClients[clientPeerId];

    const orderCards = document.querySelectorAll(`.order-card[data-client-peer-id="${clientPeerId}"]`);
    orderCards.forEach(card => {
        const statusEl = card.querySelector('.client-connection-status');
        if (statusEl) statusEl.textContent = "Client Disconnected";
        card.style.opacity = "0.7";
        const processBtn = card.querySelector('.process-payment-btn');
        if(processBtn && processBtn.textContent.includes("Process")) {
            processBtn.disabled = true;
            processBtn.title = "Client disconnected, cannot process.";
        }
    });
}


function updateShopPeerStatus(message, type = "info", peerIdText = "N/A") {
    if (peerIdDisplaySpan) peerIdDisplaySpan.textContent = peerIdText;
    if (peerConnectionMessage) peerConnectionMessage.textContent = message;

    if (connectionStatusDot) {
        connectionStatusDot.classList.remove('status-connected', 'status-disconnected', 'status-pending');
        if (type === "success" && peerIdText !== "Error" && peerIdText !== "Closed" && peerIdText !== "N/A" && peerIdText !== "Initializing...") {
            connectionStatusDot.classList.add('status-connected');
        } else if (type === "error") {
            connectionStatusDot.classList.add('status-disconnected');
        } else {
            connectionStatusDot.classList.add('status-pending');
        }
    }
}

function displayNewOrder(orderData, clientPeerId) {
    if (!ordersListDiv) {
        console.error("ordersListDiv not found, cannot display order.");
        return;
    }
    if(noOrdersMessage) noOrdersMessage.style.display = 'none';

    const orderCardId = `order-card-${clientPeerId}-${orderData.idempotencyKey || Date.now()}`;

    const card = document.createElement('div');
    card.className = 'order-card';
    card.id = orderCardId;
    card.setAttribute('data-client-peer-id', clientPeerId);

    const timestamp = new Date().toLocaleString();
    const formattedAmount = orderData.amountCents ? `$${(orderData.amountCents / 100).toFixed(2)}` : 'N/A';

    card.innerHTML = `
        <h3 class="text-xl text-splotch-red">Order from Client: <span class="font-mono text-sm">${clientPeerId.substring(0,12)}...</span></h3>
        <p class="text-sm text-gray-600">Received: <span class="order-timestamp">${timestamp}</span></p>
        <p class="text-sm text-gray-600 client-connection-status">Client Connected</p>
        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 order-details">
            <div>
                <dt>Name:</dt>
                <dd class="customer-name">${orderData.billingContact?.givenName || ''} ${orderData.billingContact?.familyName || ''}</dd>
                <dt>Email:</dt>
                <dd class="customer-email">${orderData.billingContact?.email || 'N/A'}</dd>
                <dt>Phone:</dt>
                <dd class="customer-phone">${orderData.billingContact?.phone || 'N/A'}</dd>
                <dt>Address:</dt>
                <dd>${orderData.billingContact?.addressLines?.join(', ') || 'N/A'}</dd>
                <dd>${orderData.billingContact?.city || ''}, ${orderData.billingContact?.state || ''} ${orderData.billingContact?.postalCode || ''} (${orderData.billingContact?.countryCode || ''})</dd>
            </div>
            <div>
                <dt>Quantity:</dt>
                <dd class="order-quantity">${orderData.orderDetails?.quantity || 'N/A'}</dd>
                <dt>Material:</dt>
                <dd class="order-material">${orderData.orderDetails?.material || 'N/A'}</dd>
                <dt>Amount:</dt>
                <dd class="order-amount">${formattedAmount}</dd>
                <dt>Cut Line File:</dt>
                <dd class="order-cutfile">${orderData.orderDetails?.cutLineFileName || 'None provided'}</dd>
                <dt>Idempotency Key:</dt>
                <dd class="font-mono text-xs">${orderData.idempotencyKey || 'N/A'}</dd>
            </div>
        </div>
        <div class="mt-2 sticker-design-container">
            <dt>Sticker Design Preview:</dt>
            ${orderData.designDataUrl ?
                `<img src="${orderData.designDataUrl}" alt="Sticker Design" class="sticker-design-img">` :
                '<p class="design-placeholder text-sm text-gray-500">Design image not yet received or provided...</p>'
            }
        </div>
        <div class="mt-2">
            <dt>Payment Nonce (Source ID):</dt>
            <dd class="payment-nonce font-mono text-xs break-all">${orderData.sourceId || 'N/A'}</dd>
        </div>
        <div class="mt-4">
            <button class="process-payment-btn bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md" data-order-card-id="${orderCardId}" data-client-peer-id="${clientPeerId}">
                Process Payment & Confirm Order
            </button>
        </div>
        <p class="payment-processing-status mt-2 text-sm italic"></p>
    `;

    ordersListDiv.prepend(card);

    const processBtn = card.querySelector('.process-payment-btn');
    processBtn.addEventListener('click', () => handleProcessPayment(orderData, orderCardId, clientPeerId));
}

async function handleProcessPayment(orderData, orderCardId, clientPeerId) {
    const orderCardElement = document.getElementById(orderCardId);
    const statusEl = orderCardElement ? orderCardElement.querySelector('.payment-processing-status') : null;
    const processBtn = orderCardElement ? orderCardElement.querySelector('.process-payment-btn') : null;

    if (!squareApiKeyInputEl || !squareApiKeyInputEl.value.trim()) {
        const msg = 'Error: Square API Key is missing. Please enter it above.';
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.classList.remove('text-green-700');
            statusEl.classList.add('text-red-700');
        }
        alert(msg);
        return;
    }
    const squareSecretKey = squareApiKeyInputEl.value.trim();

    if (statusEl) statusEl.textContent = 'Processing payment with Square...';
    if (processBtn) processBtn.disabled = true;

    console.log("Attempting to process payment for order:", orderData);
    console.log("Using Square API Key (masked for log):", "********" + squareSecretKey.slice(-4));

    // --- Direct Square API Call from Browser ---
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! SECURITY WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // Making calls to the Square API directly from the client-side (browser) with a SECRET API key
    // is highly insecure and NOT RECOMMENDED for production environments.
    // 1. Exposure of Secret Key: Your Square Secret API Key can be exposed to anyone
    //    inspecting the browser's network traffic or JavaScript code.
    // 2. CORS Issues: Browsers enforce Cross-Origin Resource Sharing (CORS) policies.
    //    Direct client-side API calls to Square (or many other third-party APIs) will often
    //    fail due to CORS restrictions, as the API server may not explicitly allow
    //    requests from your web application's origin. The `net::ERR_FAILED` in logs
    //    is a common symptom of this.
    //
    // RECOMMENDED APPROACH:
    // Use a backend proxy server. Your client application should send payment details to YOUR
    // backend, and YOUR backend should securely communicate with the Square API using the
    // secret key. This keeps the secret key off the client and manages CORS appropriately.
    //
    // This direct client-side call is included here for simplified demonstration purposes ONLY,
    // and assumes a development context where such risks might be temporarily accepted or
    // where browser security is relaxed (e.g. via specific browser extensions for development).
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    const SQUARE_API_URL = 'https://connect.squareupsandbox.com/v2/payments'; // For Sandbox
    // For production, use: 'https://connect.squareup.com/v2/payments';

    const paymentPayload = {
        source_id: orderData.sourceId,
        idempotency_key: orderData.idempotencyKey || `peer-order-${Date.now()}`, // Ensure idempotency key
        amount_money: {
            amount: orderData.amountCents, // Square API expects amount as integer in smallest currency unit
            currency: orderData.currency || 'USD'
        },
        // Optional: Add more details if needed by Square API
        // buyer_email_address: orderData.billingContact?.email,
        // note: `Order for ${orderData.orderDetails?.quantity} stickers (${orderData.orderDetails?.material})`,
    };

    try {
        console.log("Sending CreatePayment request to Square API:", JSON.stringify(paymentPayload));
        const response = await fetch(SQUARE_API_URL, {
            method: 'POST',
            headers: {
                'Square-Version': '2023-10-18', // Use a recent API version
                'Authorization': `Bearer ${squareSecretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentPayload)
        });

        const responseData = await response.json();
        console.log("Square API Response:", responseData);

        if (!response.ok || responseData.errors) {
            let errorMessage = "Payment processing failed.";
            if (responseData.errors && responseData.errors.length > 0) {
                errorMessage = responseData.errors.map(err => `[${err.category}/${err.code}]: ${err.detail}`).join('; ');
            } else if (responseData.error && responseData.error.message) { // Older error format
                 errorMessage = responseData.error.message;
            } else if (response.statusText) {
                errorMessage = `Square API Error: ${response.status} ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        // Payment successful
        const payment = responseData.payment;
        if (statusEl) {
            statusEl.textContent = `Success! Payment ID: ${payment.id}. Order confirmed.`;
            statusEl.classList.remove('text-red-700');
            statusEl.classList.add('text-green-700');
        }
        if (processBtn) processBtn.textContent = "Payment Processed";

        const clientConn = connectedClients[clientPeerId];
        if (clientConn && clientConn.open) {
            clientConn.send({
                type: 'paymentResponse',
                success: true,
                paymentId: payment.id,
                orderId: payment.order_id, // Square uses order_id
                message: 'Your payment was successful and the order is confirmed!',
            });
        }

        // Here you would typically also save the order details locally at the print shop,
        // associate it with the Square payment ID, and manage fulfillment.
        // Also, consider IPFS upload of the design here if needed.

    } catch (error) {
        console.error("Error processing payment with Square API:", error);
        if (statusEl) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.classList.remove('text-green-700');
            statusEl.classList.add('text-red-700');
        }
        if (processBtn) {
            processBtn.disabled = false;
            processBtn.textContent = "Retry Payment";
        }

        const clientConn = connectedClients[clientPeerId];
        if (clientConn && clientConn.open) {
            clientConn.send({
                type: 'paymentResponse',
                success: false,
                message: `Payment processing failed: ${error.message}`
            });
        }
    }
}


// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    peerIdDisplaySpan = document.getElementById('peer-id-display')?.querySelector('span');
    peerConnectionMessage = document.getElementById('peer-connection-message');
    shopPeerIdInput = document.getElementById('shopPeerIdInput');
    setPeerIdBtn = document.getElementById('setPeerIdBtn');
    ordersListDiv = document.getElementById('orders-list');
    noOrdersMessage = document.getElementById('no-orders-message');
    connectionStatusDot = document.getElementById('connection-status-dot');
    squareApiKeyInputEl = document.getElementById('squareApiKeyInput');
    const apiKeyFormEl = document.getElementById('apiKeyForm');

    if (apiKeyFormEl) {
        apiKeyFormEl.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent actual form submission
            console.log("API key form 'submission' prevented (Enter key likely pressed in input).");
            // Optionally, could trigger a specific action here, but for now, just preventing default is enough.
        });
    }

    if (setPeerIdBtn) {
        setPeerIdBtn.addEventListener('click', () => {
            // Adding a log to confirm the click handler is firing and what value is being read.
            console.log(`setPeerIdBtn clicked. Input ID: '${shopPeerIdInput ? shopPeerIdInput.value : "N/A"}'`);
            const requestedId = shopPeerIdInput ? shopPeerIdInput.value.trim() : null;
            initializeShopPeer(requestedId);
        });
    } else {
        // This error is crucial. If it appears, the HTML is missing the button or has a wrong ID.
        console.error("CRITICAL: Set Peer ID button (setPeerIdBtn) not found in the DOM. Click events will not work.");
    }
    // This sets the initial state. If it remains this state after a click, the event handler above did not run or failed to change the state.
    updateShopPeerStatus("Ready to set Peer ID or auto-generate.", "pending", "Not Set");
});

// --- Image Chunk Handling ---
function handleImageDataChunk(data, clientPeerId) {
    const { dataId, chunkIndex, chunkData, totalChunks } = data;

    if (!imageDataBuffers[dataId]) {
        imageDataBuffers[dataId] = {
            chunks: new Array(totalChunks),
            totalChunks: totalChunks,
            receivedChunks: 0
        };
        console.log(`Initialized buffer for image dataId: ${dataId}, expecting ${totalChunks} chunks.`);
    }

    const buffer = imageDataBuffers[dataId];
    if (!buffer.chunks[chunkIndex]) { // Check if chunk already received (e.g. due to retransmission)
        buffer.chunks[chunkIndex] = chunkData;
        buffer.receivedChunks++;
        console.log(`Received chunk ${chunkIndex + 1}/${totalChunks} for dataId: ${dataId}`);
    } else {
        console.warn(`Received duplicate chunk ${chunkIndex + 1}/${totalChunks} for dataId: ${dataId}. Ignoring.`);
        return; // Avoid processing duplicate chunk
    }


    if (buffer.receivedChunks === buffer.totalChunks) {
        console.log(`All ${totalChunks} chunks received for dataId: ${dataId}. Reconstructing image...`);
        try {
            const fullImageData = buffer.chunks.join('');
            // The orderCardId is constructed using clientPeerId and idempotencyKey (which is dataId here)
            const orderCardId = `order-card-${clientPeerId}-${dataId}`;
            const orderCard = document.getElementById(orderCardId);

            if (orderCard) {
                let imgElement = orderCard.querySelector('.sticker-design-img');
                const imgContainer = orderCard.querySelector('.sticker-design-container');

                if (!imgContainer) {
                    console.error(`Could not find sticker-design-container in order card ${orderCardId}`);
                    return;
                }

                // If newOrder didn't have designDataUrl, the placeholder might be there.
                const placeholder = orderCard.querySelector('.design-placeholder');
                if (placeholder) {
                    placeholder.remove();
                }

                if (!imgElement) {
                    imgElement = document.createElement('img');
                    imgElement.className = 'sticker-design-img'; // Use a specific class for the image itself
                    imgElement.alt = 'Sticker Design';
                    imgContainer.appendChild(imgElement);
                }
                imgElement.src = fullImageData;
                console.log(`Image updated for order card: ${orderCardId}`);
            } else {
                console.warn(`Order card ${orderCardId} not found to update image for dataId: ${dataId}`);
            }
        } catch (error) {
            console.error(`Error reconstructing or displaying image for dataId ${dataId}:`, error);
        } finally {
            delete imageDataBuffers[dataId]; // Clean up buffer
            console.log(`Buffer cleaned for dataId: ${dataId}`);
        }
    }
}
