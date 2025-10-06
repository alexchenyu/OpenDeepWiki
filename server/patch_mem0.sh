#!/bin/bash
# Patch mem0 to remove dimensions parameter for litellm compatibility

OPENAI_PY="/usr/local/lib/python3.12/site-packages/mem0/embeddings/openai.py"

if [ -f "$OPENAI_PY" ]; then
    echo "Patching mem0 embeddings/openai.py to remove dimensions parameter..."
    
    # Backup original file
    cp "$OPENAI_PY" "${OPENAI_PY}.backup"
    
    # Replace the line that includes dimensions parameter
    sed -i 's/self.client.embeddings.create(input=\[text\], model=self.config.model, dimensions=self.config.embedding_dims)/self.client.embeddings.create(input=[text], model=self.config.model)/g' "$OPENAI_PY"
    
    echo "Patch applied successfully!"
else
    echo "Warning: $OPENAI_PY not found, skipping patch"
fi

# Start the application
exec "$@"

