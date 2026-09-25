"""
Signal Optimizer — Deep Learning / Rule-based hybrid
Computes optimal green-time allocation for each intersection phase.
"""

import numpy as np
import logging
from typing import Dict, Tuple, List

logger = logging.getLogger(__name__)


class SignalOptimizer:
    """
    Optimises traffic signal timing using a density-weighted algorithm
    with optional Q-learning refinement.
    """

    def __init__(self,
                 min_green: int = 10,
                 max_green: int = 60,
                 yellow_time: int = 3,
                 algorithm: str = "density_based"):
        self.min_green = min_green
        self.max_green = max_green
        self.yellow_time = yellow_time
        self.algorithm = algorithm

        # Q-learning state
        self.q_table: Dict[str, np.ndarray] = {}
        self.alpha = 0.1    # learning rate
        self.gamma = 0.9    # discount factor
        self.epsilon = 0.1  # exploration rate

        # History for adaptive tuning
        self._wait_history: List[float] = []

    # ─── Public API ───────────────────────────────────────────

    def optimize(self,
                 vehicle_counts: Dict[str, int],
                 active_phase: Tuple[str, str]) -> Dict:
        """
        Returns timing dict with keys: green_time, yellow_time, red_time.
        """
        if self.algorithm == "q_learning":
            return self._q_learning_optimize(vehicle_counts, active_phase)
        return self._density_optimize(vehicle_counts, active_phase)

    def estimate_wait(self,
                      counts: Dict[str, int],
                      active_phase: Tuple[str, str]) -> float:
        """Estimate average waiting time in seconds for non-active lanes."""
        passive = [l for l in counts if l not in active_phase]
        if not passive:
            return 0.0
        passive_load = sum(counts[l] for l in passive)
        cycle = self._density_optimize(counts, active_phase)['green_time']
        wait = (passive_load / max(1, len(passive))) * (cycle / 10.0)
        return round(wait, 2)

    def get_phase_priority(self,
                           counts: Dict[str, int],
                           phases: List[Tuple[str, str]]) -> int:
        """Return index of highest-priority phase based on vehicle density."""
        scores = []
        for phase in phases:
            score = sum(counts.get(lane, 0) for lane in phase)
            scores.append(score)
        return int(np.argmax(scores))

    # ─── Algorithms ───────────────────────────────────────────

    def _density_optimize(self,
                           counts: Dict[str, int],
                           active_phase: Tuple[str, str]) -> Dict:
        """Webster-inspired density-weighted timing."""
        active_count  = sum(counts.get(l, 0) for l in active_phase)
        passive_count = sum(counts.get(l, 0) for l in counts if l not in active_phase)
        total = active_count + passive_count or 1

        density_ratio = active_count / total
        green_time = int(self.min_green + density_ratio * (self.max_green - self.min_green))
        green_time = np.clip(green_time, self.min_green, self.max_green)

        remaining = (self.max_green - green_time) + self.min_green
        red_time   = max(self.min_green, remaining)

        return {
            "green_time":  int(green_time),
            "yellow_time": self.yellow_time,
            "red_time":    int(red_time),
            "algorithm":   "density_based"
        }

    def _q_learning_optimize(self,
                              counts: Dict[str, int],
                              active_phase: Tuple[str, str]) -> Dict:
        """Simple tabular Q-learning for discrete timing slots."""
        state = self._encode_state(counts)
        if state not in self.q_table:
            self.q_table[state] = np.zeros(5)   # 5 discrete timing options

        if np.random.random() < self.epsilon:
            action = np.random.randint(5)
        else:
            action = int(np.argmax(self.q_table[state]))

        # Map action → green time
        green_options = [self.min_green + i * (self.max_green - self.min_green) // 4
                         for i in range(5)]
        green_time = green_options[action]

        # Reward: fewer waiting vehicles = better
        reward = -sum(counts.get(l, 0) for l in counts if l not in active_phase)
        next_state = state  # simplified
        if next_state not in self.q_table:
            self.q_table[next_state] = np.zeros(5)

        # Q-update
        old_q = self.q_table[state][action]
        self.q_table[state][action] = old_q + self.alpha * (
            reward + self.gamma * np.max(self.q_table[next_state]) - old_q
        )

        red_time = max(self.min_green, self.max_green - green_time + self.min_green)
        return {
            "green_time":  int(green_time),
            "yellow_time": self.yellow_time,
            "red_time":    int(red_time),
            "algorithm":   "q_learning"
        }

    def _encode_state(self, counts: Dict[str, int]) -> str:
        """Discretise vehicle counts to a compact state string."""
        def bucket(n): return min(3, n // 3)
        return "_".join(str(bucket(counts.get(d, 0))) for d in ["north", "south", "east", "west"])
