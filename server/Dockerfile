FROM python:3.12-slim

WORKDIR /app

# 只复制 requirements.txt 用于缓存优化
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# 复制所有应用文件（会覆盖上面的单独复制）
COPY . .

# Make patch script executable
RUN chmod +x patch_mem0.sh

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

# Use patch script as entrypoint
ENTRYPOINT ["/app/patch_mem0.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
