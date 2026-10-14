"""
Google Cloud Vision API client for food image analysis.

Uses GOOGLE_APPLICATION_CREDENTIALS env var for auth. Set it to the path
of your service account JSON (e.g. in .env, never commit the JSON).
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Max image size: 20 MB (Vision API limit)
MAX_IMAGE_SIZE = 20 * 1024 * 1024


def detect_food_labels(image_bytes: bytes, max_results: int = 10) -> list[dict]:
    """
    Detect labels in an image using Google Cloud Vision API.
    Returns list of {"description": str, "score": float, "topicality": float}.
    """
    if not image_bytes or len(image_bytes) > MAX_IMAGE_SIZE:
        raise ValueError("Invalid image: empty or exceeds 20 MB")

    try:
        from google.cloud import vision
    except ImportError as e:
        logger.error("google-cloud-vision not installed: %s", e)
        raise RuntimeError("Vision API client not available. Install google-cloud-vision.") from e

    # Auth via GOOGLE_APPLICATION_CREDENTIALS (set in .env, never in code)
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)

    response = client.annotate_image({
        "image": image,
        "features": [
            vision.Feature(type_=vision.Feature.Type.LABEL_DETECTION, max_results=max_results),
            vision.Feature(type_=vision.Feature.Type.WEB_DETECTION, max_results=max_results),
        ],
    })

    if response.error.message:
        logger.error("Vision API error: %s", response.error.message)
        raise RuntimeError(response.error.message)

    labels = []
    for ann in response.label_annotations:
        labels.append({
            "description": ann.description or "",
            "score": float(ann.score),
        })

    web = response.web_detection
    if web:
        for guess in web.best_guess_labels:
            label = getattr(guess, "label", "") or ""
            if label:
                labels.append({"description": label, "score": 0.95})
        for entity in web.web_entities:
            description = entity.description or ""
            score = float(entity.score or 0)
            if description and score >= 0.3:
                labels.append({"description": description, "score": score})
    return labels
