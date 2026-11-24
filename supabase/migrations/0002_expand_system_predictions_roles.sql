-- ==============================================================================
-- Allow system / cron to insert and update daily predictions, grades, and weights
-- ==============================================================================

alter policy "Authenticated users can insert daily predictions" on public.daily_predictions to anon, authenticated;
alter policy "Authenticated users can update daily predictions" on public.daily_predictions to anon, authenticated;

alter policy "Authenticated users can insert prediction grades" on public.prediction_grades to anon, authenticated;
alter policy "Authenticated users can update prediction grades" on public.prediction_grades to anon, authenticated;

alter policy "Authenticated users can insert model weights history" on public.model_weights_history to anon, authenticated;
alter policy "Authenticated users can update model weights history" on public.model_weights_history to anon, authenticated;
