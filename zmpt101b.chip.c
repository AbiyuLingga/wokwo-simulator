#include "wokwi-api.h"
#include <math.h>
#include <stdlib.h>

#define PI 3.14159265358979323846f
#define SQRT2 1.41421356237f

typedef struct {
  pin_t pin_out;
  uint32_t attr_voltage_rms;
  uint32_t attr_frequency;
  uint32_t attr_sensor_rms_at_220;
  timer_t timer;
} chip_state_t;

static float clampf(float value, float low, float high) {
  if (value < low) {
    return low;
  }
  if (value > high) {
    return high;
  }
  return value;
}

static void update_output(void *user_data) {
  chip_state_t *chip = (chip_state_t *)user_data;

  const float voltage_rms = attr_read_float(chip->attr_voltage_rms);
  const float frequency = attr_read_float(chip->attr_frequency);
  const float sensor_rms_at_220 = attr_read_float(chip->attr_sensor_rms_at_220);
  const float t = (float)get_sim_nanos() / 1000000000.0f;
  const float theta = 2.0f * PI * frequency * t;
  const float sensor_rms = (voltage_rms / 220.0f) * sensor_rms_at_220;
  const float output = 2.5f + (sensor_rms * SQRT2 * sinf(theta));

  pin_dac_write(chip->pin_out, clampf(output, 0.02f, 4.98f));
}

void chip_init(void) {
  chip_state_t *chip = (chip_state_t *)calloc(1, sizeof(chip_state_t));

  pin_init("AC_L", INPUT);
  pin_init("AC_N", INPUT);
  pin_init("VCC", INPUT);
  chip->pin_out = pin_init("OUT", ANALOG);
  pin_init("GND", INPUT);

  chip->attr_voltage_rms = attr_init_float("voltageRms", 220.0f);
  chip->attr_frequency = attr_init_float("frequency", 50.0f);
  chip->attr_sensor_rms_at_220 = attr_init_float("sensorRmsAt220", 0.80f);

  const timer_config_t timer_config = {
    .callback = update_output,
    .user_data = chip,
  };
  chip->timer = timer_init(&timer_config);
  timer_start(chip->timer, 250, true);

  update_output(chip);
}
