"""
Traffic Detector using YOLOv8
Detects vehicles in frames: cars, trucks, buses, motorcycles, bicycles
"""

import cv2
import numpy as np
import logging
import os

logger = logging.getLogger(__name__)

# Vehicle class IDs in COCO dataset (used by YOLOv8)
VEHICLE_CLASSES = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    1: "bicycle"
}

COLORS = {
    "car":        (0, 255, 0),
    "motorcycle": (255, 165, 0),
    "bus":        (0, 0, 255),
    "truck":      (255, 0, 0),
    "bicycle":    (0, 255, 255),
}


class TrafficDetector:
    """YOLO-based vehicle detector with fallback to OpenCV HOG."""

    def __init__(self, model_path: str = None, confidence: float = 0.5):
        self.confidence = confidence
        self.model = None
        self.use_yolo = False
        self._load_model(model_path)

    def _load_model(self, model_path: str):
        """Try to load YOLOv8; fallback to simulated detection."""
        try:
            from ultralytics import YOLO
            if model_path and os.path.exists(model_path):
                self.model = YOLO(model_path)
                logger.info(f"Loaded custom YOLO model: {model_path}")
            else:
                self.model = YOLO('yolov8n.pt')   # downloads on first run
                logger.info("Loaded YOLOv8n pretrained model")
            self.use_yolo = True
        except ImportError:
            logger.warning("ultralytics not installed — using simulated detection.")
        except Exception as e:
            logger.warning(f"YOLO load failed ({e}) — using simulated detection.")

    # ─── Public API ───────────────────────────────────────────

    def detect(self, frame: np.ndarray) -> dict:
        """Run detection on a BGR frame and return structured results."""
        if self.use_yolo and self.model:
            return self._yolo_detect(frame)
        return self._simulated_detect(frame)

    def draw_detections(self, frame: np.ndarray, results: dict) -> np.ndarray:
        """Draw bounding boxes and labels on the frame."""
        annotated = frame.copy()
        for det in results.get('detections', []):
            x1, y1, x2, y2 = det['bbox']
            label = det['class']
            conf  = det['confidence']
            color = COLORS.get(label, (128, 128, 128))

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            tag = f"{label} {conf:.2f}"
            (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(annotated, (x1, y1 - th - 4), (x1 + tw, y1), color, -1)
            cv2.putText(annotated, tag, (x1, y1 - 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

        # Overlay count
        count_text = f"Vehicles: {results['total_count']}"
        cv2.putText(annotated, count_text, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        return annotated

    def estimate_density(self, frame: np.ndarray) -> float:
        """Return normalised density 0-1 based on vehicle count."""
        results = self.detect(frame)
        count = results['total_count']
        return min(1.0, count / 20.0)

    # ─── Internal ─────────────────────────────────────────────

    def _yolo_detect(self, frame: np.ndarray) -> dict:
        results = self.model(frame, conf=self.confidence, verbose=False)[0]
        detections = []
        counts = {v: 0 for v in VEHICLE_CLASSES.values()}

        for box in results.boxes:
            cls_id = int(box.cls[0])
            if cls_id not in VEHICLE_CLASSES:
                continue
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            label = VEHICLE_CLASSES[cls_id]
            counts[label] += 1
            detections.append({
                "class": label,
                "confidence": round(conf, 3),
                "bbox": [x1, y1, x2, y2]
            })

        return {
            "total_count": len(detections),
            "detections": detections,
            "class_counts": counts
        }

    def _simulated_detect(self, frame: np.ndarray) -> dict:
        """Generate plausible random detections for demo/testing."""
        h, w = frame.shape[:2]
        n = np.random.randint(2, 10)
        detections = []
        counts = {v: 0 for v in VEHICLE_CLASSES.values()}

        for _ in range(n):
            label = np.random.choice(list(VEHICLE_CLASSES.values()),
                                     p=[0.60, 0.10, 0.10, 0.15, 0.05])
            bw = np.random.randint(60, 120)
            bh = np.random.randint(40, 90)
            x1 = np.random.randint(0, max(1, w - bw))
            y1 = np.random.randint(0, max(1, h - bh))
            conf = round(np.random.uniform(0.55, 0.99), 3)
            counts[label] += 1
            detections.append({
                "class": label,
                "confidence": conf,
                "bbox": [x1, y1, x1 + bw, y1 + bh]
            })

        return {
            "total_count": len(detections),
            "detections": detections,
            "class_counts": counts
        }
