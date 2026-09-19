#!/bin/bash
# Run all AI model bridges for VS Code Copilot

# Set API keys
export BEDROCK_API_KEY="ABSKTWFudGxlQXBpS2V5LTI2eTh5Mm91LWF0LTA1OTkyNjIwODg1MDppYXJ4aENTSlE4OWpLZUxpV295YWkvNjZ3azBJb3BIaDFNa2ZZcFowRG9Ob3p6cm9KNmprenU2RGxjRT0="
export GOOGLE_AI_STUDIO_KEY="AQ.Ab8RN6KipPBvC6swXD96QX45ah-g0fRoDTl-lk4WyjFemWLp3A-"

# Create config directories
mkdir -p /home/codespace/.config/uSafeArch/gemma-vscode-bridge
mkdir -p /home/codespace/.config/uSafeArch/gemini-vscode-bridge

# Ensure bedrock key file exists
echo "$BEDROCK_API_KEY" > /home/codespace/.config/uSafeArch/gemma-vscode-bridge/bedrock-key.txt

# Ensure gemini key file exists
echo "$GOOGLE_AI_STUDIO_KEY" > /home/codespace/.config/uSafeArch/gemini-vscode-bridge/gemini-key.txt

# Start server-model-bridge (Bedrock - 11 models on port 18880)
echo "Starting server-model-bridge on port 18880..."
/home/codespace/nvm/current/bin/node /workspaces/immiaccount/server-model-bridge/server.mjs /home/codespace/.config/uSafeArch/gemma-vscode-bridge/server-config.json &
SERVER_MODEL_PID=$!

# Start gemma-vscode-bridge (Bedrock via Mantle on port 18882)
echo "Starting gemma-vscode-bridge on port 18882..."
/home/codespace/nvm/current/bin/node /workspaces/immiaccount/gemma-vscode-bridge.mjs &
GEMMA_BRIDGE_PID=$!

# Start google-ai-studio-bridge (Gemini on port 18883)
echo "Starting google-ai-studio-bridge on port 18883..."
/home/codespace/nvm/current/bin/node /workspaces/immiaccount/google-ai-studio-bridge.mjs &
GEMINI_BRIDGE_PID=$!

echo ""
echo "All bridges started!"
echo "  server-model-bridge (Bedrock 11 models): http://127.0.0.1:18880/v1"
echo "  gemma-vscode-bridge (Bedrock Mantle):    http://127.0.0.1:18882/{token}/v1"
echo "  google-ai-studio-bridge (Gemini 8):      http://127.0.0.1:18883/{token}/v1"
echo ""
echo "PIDs: $SERVER_MODEL_PID $GEMMA_BRIDGE_PID $GEMINI_BRIDGE_PID"
echo ""
echo "To stop all: kill $SERVER_MODEL_PID $GEMMA_BRIDGE_PID $GEMINI_BRIDGE_PID"
echo ""
echo "Reload VS Code: Cmd/Ctrl+Shift+P -> 'Developer: Reload Window'"

wait