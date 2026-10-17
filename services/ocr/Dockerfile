# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-http.txt ./
# RapidOCR declares the GUI cv2 package. Replace it with the headless build in
# this dedicated image, as in the existing local OCR installation procedure.
RUN pip install --no-cache-dir -r requirements-http.txt rapidocr==3.9.2 onnxruntime==1.29.0 \
    && pip uninstall -y opencv-python \
    && pip install --no-cache-dir opencv-python-headless==4.13.0.92 \
    && python -c "import cv2, onnxruntime; from rapidocr import RapidOCR; RapidOCR()"
RUN groupadd --gid 1000 ocr && useradd --uid 1000 --gid ocr --create-home ocr
COPY --chown=ocr:ocr app.py parser.py ./
USER ocr
# Confirm warmed model files are readable by the actual runtime user as well.
RUN python -c "from rapidocr import RapidOCR; RapidOCR()"
EXPOSE 8010
CMD ["python", "-m", "uvicorn", "app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8010", "--workers", "1", "--timeout-graceful-shutdown", "90"]
